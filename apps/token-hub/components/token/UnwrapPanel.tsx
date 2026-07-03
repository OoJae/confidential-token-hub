"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { clsx } from "clsx";
import { AddressChip, ErrorToast, formatUnits, type FheErrorCode } from "@cipher/ui";
import { usePendingUnwraps, useUnwrap } from "@cipher/registry-sdk/react";
import type { WrapperMeta } from "@cipher/registry-sdk";
import type { ChainId } from "@cipher/addresses";
import { txUrl } from "@/lib/links";
import { parseAmount } from "./amount";

const STEPS = ["Requested", "Finalizing", "Done"] as const;

export function UnwrapPanel({
  meta,
  chainId,
  disabled,
}: {
  meta: WrapperMeta;
  chainId: ChainId;
  disabled: boolean;
}) {
  const { address } = useAccount();
  const [input, setInput] = useState("");
  const unwrap = useUnwrap({ chainId, wrapper: meta.wrapper });
  const pending = usePendingUnwraps({ chainId, account: address, wrappers: [meta.wrapper] });

  const amount = useMemo(() => parseAmount(input, meta.decimals), [input, meta.decimals]);

  // Resumable records for THIS wrapper, excluding the one being worked on.
  const resumable = (pending.data ?? []).filter(
    (r) => r.requestId !== unwrap.requestId,
  );

  const stepIndex =
    unwrap.phase === "done"
      ? 3
      : unwrap.phase === "finalizing"
        ? 1
        : unwrap.phase === "requested"
          ? 1
          : unwrap.phase === "requesting"
            ? 0
            : -1;

  const undSymbol = meta.underlyingMeta?.symbol ?? "underlying";

  return (
    <div className="max-w-lg space-y-5">
      <p className="text-sm text-surface-600 dark:text-surface-300">
        Unwrapping is <strong>two-step</strong>: burn confidentially, then the amount is publicly
        decrypted and finalized to release the {undSymbol}. The amount becomes public at
        finalization.
      </p>

      {/* resumable records (refresh recovery) */}
      {resumable.length > 0 ? (
        <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
          <p className="text-sm font-medium">
            {resumable.length} unfinalized unwrap{resumable.length > 1 ? "s" : ""} found
          </p>
          {resumable.map((r) => (
            <div key={r.requestId} className="flex items-center gap-2 text-sm">
              <AddressChip address={r.requestId} chainId={chainId} kind="tx" explorerUrl="" />
              <button
                type="button"
                disabled={disabled || unwrap.phase === "finalizing"}
                onClick={() => {
                  unwrap.resume(r.requestId);
                  void unwrap.finalize(r.requestId).catch(() => undefined);
                }}
                className="ml-auto rounded-chip bg-accent-soft px-3 py-1 text-xs font-medium text-accent-strong hover:bg-accent/20 disabled:opacity-50"
              >
                Finalize
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* the stepper */}
      {stepIndex >= 0 ? (
        <ol className="flex items-center gap-2">
          {STEPS.map((label, i) => {
            const done = stepIndex > i;
            const current = stepIndex === i;
            return (
              <li key={label} className="flex flex-1 items-center gap-2">
                <span
                  className={clsx(
                    "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                    done && "bg-success text-white",
                    current && "bg-accent-strong text-white",
                    !done && !current && "bg-surface-200 text-surface-500 dark:bg-surface-700",
                  )}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span
                  className={clsx(
                    "text-xs font-medium",
                    current ? "text-surface-950 dark:text-surface-50" : "text-surface-500",
                  )}
                >
                  {label}
                  {current && unwrap.phase === "finalizing" ? "…" : ""}
                </span>
                {i < STEPS.length - 1 ? (
                  <span className="h-px flex-1 bg-surface-200 dark:bg-surface-700" />
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      {unwrap.phase === "finalizing" ? (
        <p className="text-sm text-surface-500">
          The network is publicly decrypting your unwrap amount — usually a few seconds. Retries
          run automatically.
        </p>
      ) : null}

      {unwrap.phase === "done" && unwrap.cleartext !== undefined ? (
        <div className="rounded-lg bg-success/10 px-3 py-2.5 text-sm">
          Received{" "}
          <strong className="font-mono">
            {formatUnits(unwrap.cleartext * meta.rate, meta.underlyingMeta?.decimals ?? meta.decimals)}{" "}
            {undSymbol}
          </strong>
          {unwrap.finalizeTxHash ? (
            <a
              href={txUrl(chainId, unwrap.finalizeTxHash)}
              target="_blank"
              rel="noreferrer"
              className="ml-2 underline underline-offset-2"
            >
              View tx ↗
            </a>
          ) : null}
        </div>
      ) : null}

      {/* start form */}
      {unwrap.phase === "idle" || unwrap.phase === "error" || unwrap.phase === "done" ? (
        <div className="space-y-3">
          <div>
            <label htmlFor="unwrap-amount" className="text-sm font-medium">
              Amount to unwrap ({meta.symbol})
            </label>
            <input
              id="unwrap-amount"
              inputMode="decimal"
              placeholder="0.0"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={disabled}
              className="mt-1.5 w-full rounded-lg border border-surface-300 bg-transparent px-3 py-2 font-mono text-lg tabular-nums outline-none focus:border-accent disabled:opacity-50 dark:border-surface-600"
            />
          </div>
          <button
            type="button"
            disabled={disabled || !address || amount === null || amount === 0n}
            onClick={() => {
              if (amount === null) return;
              setInput("");
              void unwrap.start({ amount }).catch(() => undefined);
            }}
            className="w-full rounded-lg bg-accent-strong px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            title={disabled ? "Actions are live on Sepolia — mainnet is read-only" : undefined}
          >
            Unwrap
          </button>
        </div>
      ) : null}

      {/* stuck at requested (e.g. finalize failed) → manual finalize */}
      {unwrap.phase === "requested" && unwrap.requestId ? (
        <button
          type="button"
          onClick={() => void unwrap.finalize().catch(() => undefined)}
          className="w-full rounded-lg bg-accent-strong px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90"
        >
          Finalize unwrap
        </button>
      ) : null}

      {unwrap.error ? (
        <ErrorToast
          code={unwrap.error.code as FheErrorCode}
          detail={unwrap.error.message.slice(0, 140)}
        />
      ) : null}
    </div>
  );
}
