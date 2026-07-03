"use client";

import { clsx } from "clsx";
import { TX_COPY, type TxPhase } from "../tx";

export interface AsyncTxStatusProps {
  phase: TxPhase;
  /** Overrides the default copy for the current phase. */
  message?: string;
  /** Optional explorer link once a tx hash exists. */
  txUrl?: string;
  className?: string;
}

/**
 * Renders the idle → encrypting → submitting → mining → decrypting →
 * done/error state machine with human-readable copy. Renders nothing at idle.
 */
export function AsyncTxStatus({ phase, message, txUrl, className }: AsyncTxStatusProps) {
  if (phase === "idle") return null;

  const busy = phase !== "done" && phase !== "error";
  const copy = message ?? TX_COPY[phase];

  return (
    <div
      role="status"
      className={clsx(
        "flex items-center gap-2 rounded-chip px-3 py-2 text-sm",
        phase === "error" && "bg-danger/10 text-danger",
        phase === "done" && "bg-success/10 text-success",
        busy && "bg-surface-100 text-surface-700 dark:bg-surface-800 dark:text-surface-200",
        className,
      )}
    >
      {busy ? (
        <svg viewBox="0 0 16 16" fill="none" className="size-4 shrink-0 animate-spin" aria-hidden>
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
          <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : phase === "done" ? (
        <svg viewBox="0 0 16 16" fill="currentColor" className="size-4 shrink-0" aria-hidden>
          <path d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.3-8.7-4 4a1 1 0 0 1-1.4 0l-1.6-1.6a1 1 0 1 1 1.4-1.4l.9.9 3.3-3.3a1 1 0 1 1 1.4 1.4Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" fill="currentColor" className="size-4 shrink-0" aria-hidden>
          <path d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm-.9-4.6L6.9 5.2a1.1 1.1 0 1 1 2.2 0l-.2 5.2a.9.9 0 0 1-1.8 0ZM8 13.2a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
        </svg>
      )}
      <span>{copy}</span>
      {txUrl ? (
        <a
          href={txUrl}
          target="_blank"
          rel="noreferrer"
          className="ml-auto shrink-0 font-medium underline underline-offset-2 hover:opacity-80"
        >
          View tx ↗
        </a>
      ) : null}
    </div>
  );
}
