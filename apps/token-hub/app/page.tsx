"use client";

import { AddressChip, ErrorToast } from "@cipher/ui";
import { REGISTRY, CHAINS } from "@cipher/addresses";
import { usePairs } from "@cipher/registry-sdk/react";
import { useNetwork } from "@/lib/network";
import { PairRow } from "@/components/registry/PairRow";
import { PrivacyExplainer } from "@/components/shell/PrivacyExplainer";

export default function ExplorerPage() {
  const { chainId } = useNetwork();
  const pairs = usePairs({ chainId });

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Confidential Token Explorer</h1>
        <p className="max-w-2xl text-sm text-surface-600 dark:text-surface-300">
          Every ERC-20 ↔ ERC-7984 wrapper pair in the official Wrappers Registry
          {chainId === CHAINS.mainnet ? " on Ethereum mainnet (read-only)" : " on Sepolia"} —
          enumerated live, revoked pairs included.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm text-surface-500">
          <span>Registry</span>
          <AddressChip address={REGISTRY[chainId]} chainId={chainId} />
          {pairs.data ? (
            <span className="rounded-chip bg-surface-100 px-2 py-0.5 text-xs dark:bg-surface-800">
              {pairs.data.length} pairs
            </span>
          ) : null}
        </div>
      </header>

      <PrivacyExplainer />

      <div className="overflow-x-auto rounded-lg border border-surface-200 dark:border-surface-700">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="border-b border-surface-200 text-xs uppercase tracking-wide text-surface-500 dark:border-surface-700">
              <th className="px-3 py-2.5 font-medium">Token</th>
              <th className="px-3 py-2.5 font-medium">Wrapper</th>
              <th className="hidden px-3 py-2.5 font-medium md:table-cell">Underlying</th>
              <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Rate</th>
              <th className="px-3 py-2.5 text-right font-medium" title="inferredTotalSupply() — public escrow of the underlying token">
                Total Value Shielded
              </th>
              <th className="px-3 py-2.5 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {pairs.isPending
              ? Array.from({ length: 7 }, (_, i) => (
                  <tr key={i} className="border-b border-surface-100 last:border-0 dark:border-surface-800">
                    {Array.from({ length: 6 }, (_, j) => (
                      <td key={j} className="px-3 py-4">
                        <div className="h-4 animate-pulse-soft rounded bg-surface-200 dark:bg-surface-700" />
                      </td>
                    ))}
                  </tr>
                ))
              : pairs.data?.map((pair) => <PairRow key={pair.wrapper} pair={pair} chainId={chainId} />)}
            {pairs.data && pairs.data.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-sm text-surface-500">
                  No pairs registered on this network yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {pairs.isError ? (
        <div className="flex items-center gap-3">
          <ErrorToast code={pairs.error.code} detail={pairs.error.message.slice(0, 120)} />
          <button
            type="button"
            onClick={() => void pairs.refetch()}
            className="rounded-chip bg-accent-soft px-3 py-1.5 text-sm font-medium text-accent-strong hover:bg-accent/20"
          >
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}
