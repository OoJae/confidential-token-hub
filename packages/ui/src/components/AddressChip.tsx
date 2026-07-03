"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { EXPLORERS, type ChainId } from "@cipher/addresses";
import { truncateAddress } from "../format";

export interface AddressChipProps {
  address: string;
  chainId?: ChainId;
  /** Overrides the explorer base URL derived from chainId. */
  explorerUrl?: string;
  /** "address" (default) or "tx" — picks the explorer path. */
  kind?: "address" | "tx";
  className?: string;
}

/** Truncated address/hash with one-click copy and an explorer link. */
export function AddressChip({
  address,
  chainId,
  explorerUrl,
  kind = "address",
  className,
}: AddressChipProps) {
  const [copied, setCopied] = useState(false);
  const base = explorerUrl ?? (chainId ? EXPLORERS[chainId] : undefined);
  const href = base ? `${base}/${kind}/${address}` : undefined;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-chip bg-surface-100 px-2 py-1 font-mono text-xs text-surface-700",
        "dark:bg-surface-800 dark:text-surface-200",
        className,
      )}
    >
      <span title={address}>{truncateAddress(address)}</span>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy address"
        className="rounded p-0.5 hover:bg-surface-200 dark:hover:bg-surface-700"
      >
        {copied ? (
          <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5 text-success" aria-hidden>
            <path d="M13.7 4.7a1 1 0 0 0-1.4-1.4L6.5 9 3.7 6.3a1 1 0 0 0-1.4 1.4l3.5 3.5a1 1 0 0 0 1.4 0l6.5-6.5Z" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5" aria-hidden>
            <path d="M10 1H4a1.5 1.5 0 0 0-1.5 1.5V11H4V2.5h6V1Zm2 2.5H6.5A1.5 1.5 0 0 0 5 5v8.5A1.5 1.5 0 0 0 6.5 15H12a1.5 1.5 0 0 0 1.5-1.5V5A1.5 1.5 0 0 0 12 3.5Zm0 10H6.5V5H12v8.5Z" />
          </svg>
        )}
      </button>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label="View on explorer"
          className="rounded p-0.5 hover:bg-surface-200 dark:hover:bg-surface-700"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5" aria-hidden>
            <path d="M6.5 3a1 1 0 0 0 0 2h3.1L4.3 10.3a1 1 0 1 0 1.4 1.4L11 6.4v3.1a1 1 0 1 0 2 0V4a1 1 0 0 0-1-1H6.5Z" />
          </svg>
        </a>
      ) : null}
    </span>
  );
}
