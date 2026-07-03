"use client";

import { clsx } from "clsx";
import { ERROR_COPY, type FheErrorCode } from "../errors";

export interface ErrorToastProps {
  code: FheErrorCode | null;
  /** Extra context appended under the taxonomy copy (never a raw error code). */
  detail?: string;
  onDismiss?: () => void;
  /** Optional action, e.g. { label: "Switch network", onClick } for WRONG_NETWORK. */
  action?: { label: string; onClick: () => void };
  className?: string;
}

/**
 * Maps the error taxonomy to plain-English toasts. Renders nothing when
 * `code` is null. Raw errors must be mapped to a FheErrorCode before they
 * get here — this component intentionally cannot render an arbitrary string
 * as the title.
 */
export function ErrorToast({ code, detail, onDismiss, action, className }: ErrorToastProps) {
  if (!code) return null;
  const copy = ERROR_COPY[code] ?? ERROR_COPY.UNKNOWN;
  const pending = code === "DECRYPTION_PENDING";

  return (
    <div
      role="alert"
      className={clsx(
        "flex w-full max-w-md items-start gap-3 rounded-lg border p-3 text-sm shadow-lg",
        pending
          ? "border-warning/30 bg-warning/10 text-surface-800 dark:text-surface-100"
          : "border-danger/30 bg-danger/10 text-surface-800 dark:text-surface-100",
        className,
      )}
    >
      <span
        className={clsx(
          "mt-0.5 size-2 shrink-0 rounded-full",
          pending ? "bg-warning animate-pulse-soft" : "bg-danger",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{copy.title}</p>
        <p className="mt-0.5 text-surface-600 dark:text-surface-300">{copy.body}</p>
        {detail ? (
          <p className="mt-1 break-words font-mono text-xs text-surface-500">{detail}</p>
        ) : null}
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-2 rounded-chip bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-strong hover:bg-accent/20"
          >
            {action.label}
          </button>
        ) : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded p-1 text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-700"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5" aria-hidden>
            <path d="M4.7 3.3a1 1 0 0 0-1.4 1.4L6.6 8l-3.3 3.3a1 1 0 1 0 1.4 1.4L8 9.4l3.3 3.3a1 1 0 0 0 1.4-1.4L9.4 8l3.3-3.3a1 1 0 0 0-1.4-1.4L8 6.6 4.7 3.3Z" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
