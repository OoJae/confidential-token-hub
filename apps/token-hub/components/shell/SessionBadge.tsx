"use client";

import { useFheSession } from "@cipher/fhe-client/react";

/**
 * The sign-once story, made visible: how many EIP-712 decryption-permit
 * signatures this tab session has collected. Stays at 1 no matter how many
 * balances are revealed. Hidden until the first signature.
 */
export function SessionBadge() {
  const { signCount, invalidate } = useFheSession();
  if (signCount === 0) return null;

  return (
    <span
      className="hidden items-center gap-1.5 rounded-chip bg-surface-100 px-2.5 py-1 text-xs text-surface-600 sm:inline-flex dark:bg-surface-800 dark:text-surface-300"
      title="EIP-712 decryption-permit signatures this session — reveals reuse the cached session"
    >
      <svg viewBox="0 0 16 16" fill="currentColor" className="size-3" aria-hidden>
        <path d="M12.9 1.6a2 2 0 0 0-2.8 0L4 7.7a2 2 0 0 0-.5.9l-.7 2.8a.75.75 0 0 0 .9.9l2.8-.7a2 2 0 0 0 .9-.5l6.1-6.1a2 2 0 0 0 0-2.8l-.6-.6ZM2.8 13.5a.75.75 0 0 0 0 1.5h10.4a.75.75 0 0 0 0-1.5H2.8Z" />
      </svg>
      {signCount} signature{signCount === 1 ? "" : "s"} this session
      <button
        type="button"
        onClick={() => void invalidate()}
        className="ml-1 rounded px-1 text-[10px] uppercase tracking-wide text-surface-400 hover:bg-surface-200 hover:text-surface-600 dark:hover:bg-surface-700"
        title="Wipe the decryption session (next reveal re-prompts once)"
      >
        reset
      </button>
    </span>
  );
}
