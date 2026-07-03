"use client";

const ROWS: { item: string; visibility: "Public" | "Private" }[] = [
  { item: "Pair addresses, validity, rate, decimals", visibility: "Public" },
  { item: "Total Value Shielded (escrowed underlying is a plain ERC-20 balance)", visibility: "Public" },
  { item: "That a wrap / transfer / unwrap transaction happened", visibility: "Public" },
  { item: "Confidential balances (euint64 ciphertext handles)", visibility: "Private" },
  { item: "Transfer amounts and wrap credits", visibility: "Private" },
  { item: "Unwrap amounts — until you finalize (public decryption)", visibility: "Private" },
];

export function PrivacyExplainer() {
  return (
    <details className="group rounded-lg border border-surface-200 dark:border-surface-700">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-surface-700 marker:content-none dark:text-surface-200">
        <span className="inline-flex items-center gap-2">
          <svg viewBox="0 0 16 16" fill="currentColor" className="size-4 text-locked" aria-hidden>
            <path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 12 6h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 5V4.5a2 2 0 1 0-4 0V6h4Z" />
          </svg>
          What's private vs public here?
          <span className="text-surface-400 transition-transform group-open:rotate-180">▾</span>
        </span>
      </summary>
      <div className="border-t border-surface-200 px-4 py-3 dark:border-surface-700">
        <ul className="space-y-1.5 text-sm">
          {ROWS.map((r) => (
            <li key={r.item} className="flex items-start gap-2">
              <span
                className={
                  r.visibility === "Private"
                    ? "mt-0.5 shrink-0 rounded bg-locked-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-locked"
                    : "mt-0.5 shrink-0 rounded bg-surface-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-surface-500 dark:bg-surface-800"
                }
              >
                {r.visibility}
              </span>
              <span className="text-surface-600 dark:text-surface-300">{r.item}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-surface-500">
          Balances are ciphertext on-chain. "Reveal" runs EIP-712 user-decryption locally against
          the Zama relayer — the value is decrypted for you only and never published.
        </p>
      </div>
    </details>
  );
}
