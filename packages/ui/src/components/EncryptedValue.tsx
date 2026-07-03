"use client";

import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { formatUnits } from "../format";

export type EncryptedValueState = "undisclosed" | "decrypting" | "revealed";

export interface EncryptedValueProps {
  state: EncryptedValueState;
  /** Only rendered when state === "revealed". */
  value?: bigint;
  decimals?: number;
  symbol?: string;
  className?: string;
  /** Animate the number counting up on reveal (default true). */
  countUp?: boolean;
}

/**
 * Renders an encrypted amount. INVARIANT: a numeric value is only ever shown
 * when `state === "revealed"` AND `value !== undefined` — an undisclosed
 * value is a locked badge, never "0" (a rendered 0 leaks "you have nothing").
 */
export function EncryptedValue({
  state,
  value,
  decimals = 6,
  symbol,
  className,
  countUp = true,
}: EncryptedValueProps) {
  const revealed = state === "revealed" && value !== undefined;
  const display = useCountUp(revealed ? value : undefined, decimals, countUp);

  if (!revealed) {
    return (
      <span
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-chip px-2.5 py-1 text-sm font-medium",
          "bg-locked-bg text-locked",
          state === "decrypting" && "animate-pulse-soft",
          className,
        )}
        aria-label={state === "decrypting" ? "Decrypting value" : "Encrypted value"}
      >
        <LockIcon className="size-3.5" />
        {state === "decrypting" ? "Decrypting…" : "Encrypted"}
      </span>
    );
  }

  return (
    <span
      className={clsx(
        "inline-flex items-baseline gap-1 font-mono tabular-nums animate-reveal-pop",
        className,
      )}
    >
      <span className="text-surface-950 dark:text-surface-50">{display}</span>
      {symbol ? <span className="text-sm text-surface-500">{symbol}</span> : null}
    </span>
  );
}

function useCountUp(target: bigint | undefined, decimals: number, enabled: boolean): string {
  const [display, setDisplay] = useState<string>("");
  const frame = useRef<number>(0);

  useEffect(() => {
    if (target === undefined) {
      setDisplay("");
      return;
    }
    if (!enabled) {
      setDisplay(formatUnits(target, decimals));
      return;
    }
    const duration = 650;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = (target * BigInt(Math.round(eased * 1000))) / 1000n;
      setDisplay(formatUnits(current, decimals));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, decimals, enabled]);

  return display;
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
      <path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 12 6h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 5V4.5a2 2 0 1 0-4 0V6h4Z" />
    </svg>
  );
}
