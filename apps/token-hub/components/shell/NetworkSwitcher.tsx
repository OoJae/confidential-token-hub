"use client";

import { clsx } from "clsx";
import { CHAINS } from "@cipher/addresses";
import { useNetwork } from "@/lib/network";

const OPTIONS = [
  { id: CHAINS.sepolia, label: "Sepolia" },
  { id: CHAINS.mainnet, label: "Mainnet", suffix: "read-only" },
] as const;

export function NetworkSwitcher() {
  const { chainId, setChain } = useNetwork();

  return (
    <div
      role="radiogroup"
      aria-label="Network"
      className="flex items-center gap-0.5 rounded-chip bg-surface-100 p-0.5 dark:bg-surface-800"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={chainId === o.id}
          onClick={() => setChain(o.id)}
          className={clsx(
            "rounded-[0.4rem] px-2.5 py-1 text-xs font-medium transition-colors",
            chainId === o.id
              ? "bg-white text-surface-950 shadow-sm dark:bg-surface-600 dark:text-surface-50"
              : "text-surface-500 hover:text-surface-800 dark:hover:text-surface-200",
          )}
        >
          {o.label}
          {"suffix" in o && o.suffix ? (
            <span className="ml-1 text-[10px] font-normal opacity-70">{o.suffix}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
