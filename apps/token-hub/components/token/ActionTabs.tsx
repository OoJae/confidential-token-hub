"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import type { WrapperMeta } from "@cipher/registry-sdk";
import type { ChainId } from "@cipher/addresses";
import { useNetwork } from "@/lib/network";
import { WrapForm } from "./WrapForm";
import { UnwrapPanel } from "./UnwrapPanel";
import { TransferForm } from "./TransferForm";
import { OperatorPanel } from "./OperatorPanel";

const TABS = ["wrap", "unwrap", "transfer", "operator"] as const;
export type ActionTab = (typeof TABS)[number];

export function ActionTabs({ meta, chainId }: { meta: WrapperMeta; chainId: ChainId }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { actionable, setChain } = useNetwork();

  const raw = searchParams.get("action");
  const active: ActionTab = TABS.includes(raw as ActionTab) ? (raw as ActionTab) : "wrap";

  const select = useCallback(
    (tab: ActionTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("action", tab);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return (
    <section className="rounded-lg border border-surface-200 dark:border-surface-700">
      <div
        role="tablist"
        className="flex gap-1 border-b border-surface-200 px-2 pt-2 dark:border-surface-700"
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={active === tab}
            onClick={() => select(tab)}
            className={clsx(
              "rounded-t-lg px-4 py-2 text-sm font-medium capitalize transition-colors",
              active === tab
                ? "border border-b-0 border-surface-200 bg-surface-50 text-surface-950 dark:border-surface-700 dark:bg-surface-950 dark:text-surface-50"
                : "text-surface-500 hover:text-surface-800 dark:hover:text-surface-200",
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {!actionable ? (
        <div className="flex items-center gap-3 border-b border-surface-200 bg-surface-100/60 px-4 py-2.5 text-sm text-surface-600 dark:border-surface-700 dark:bg-surface-800/60 dark:text-surface-300">
          <span>Actions are live on Sepolia — mainnet is read-only in this explorer.</span>
          <button
            type="button"
            onClick={() => setChain(11155111)}
            className="rounded-chip bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-strong hover:bg-accent/20"
          >
            Switch to Sepolia
          </button>
        </div>
      ) : null}

      <div role="tabpanel" className="p-4 sm:p-6">
        {active === "wrap" ? <WrapForm meta={meta} chainId={chainId} disabled={!actionable} /> : null}
        {active === "unwrap" ? <UnwrapPanel meta={meta} chainId={chainId} disabled={!actionable} /> : null}
        {active === "transfer" ? <TransferForm meta={meta} chainId={chainId} disabled={!actionable} /> : null}
        {active === "operator" ? <OperatorPanel meta={meta} chainId={chainId} disabled={!actionable} /> : null}
      </div>
    </section>
  );
}
