"use client";

import { clsx } from "clsx";

export type RevealPhase = "idle" | "signing" | "decrypting" | "revealed";

export interface RevealButtonProps {
  phase: RevealPhase;
  onReveal: () => void;
  /** Copy for the idle state (default "Reveal"). */
  label?: string;
  disabled?: boolean;
  className?: string;
}

const PHASE_COPY: Record<Exclude<RevealPhase, "idle" | "revealed">, string> = {
  signing: "Sign to reveal…",
  decrypting: "Decrypting…",
};

/**
 * The reveal affordance: idle → (one-time EIP-712 signature) → decrypting →
 * revealed. Busy phases show progress; the button never re-prompts once a
 * session exists — that policy lives in fhe-client, this just renders it.
 */
export function RevealButton({
  phase,
  onReveal,
  label = "Reveal",
  disabled,
  className,
}: RevealButtonProps) {
  if (phase === "revealed") return null;
  const busy = phase === "signing" || phase === "decrypting";

  return (
    <button
      type="button"
      onClick={onReveal}
      disabled={disabled || busy}
      aria-busy={busy}
      className={clsx(
        "inline-flex items-center gap-2 rounded-chip px-3 py-1.5 text-sm font-medium transition-colors",
        "bg-accent-soft text-accent-strong hover:bg-accent/20",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {busy ? (
        <>
          <Spinner className="size-3.5" />
          {PHASE_COPY[phase]}
        </>
      ) : (
        <>
          <EyeIcon className="size-3.5" />
          {label}
        </>
      )}
    </button>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={clsx("animate-spin", className)} aria-hidden>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
      <path d="M8 3C4.5 3 1.7 5.1.5 8c1.2 2.9 4 5 7.5 5s6.3-2.1 7.5-5C14.3 5.1 11.5 3 8 3Zm0 8.5A3.5 3.5 0 1 1 8 4.5a3.5 3.5 0 0 1 0 7Zm0-5.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
    </svg>
  );
}
