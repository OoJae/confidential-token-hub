"use client";

import Link from "next/link";
import { useAccount, useConnect } from "wagmi";
import { usePairs, useWrapperMeta } from "@cipher/registry-sdk/react";
import type { TokenWrapperPair } from "@cipher/registry-sdk";
import type { Address, ChainId } from "@cipher/addresses";
import { useFheSession } from "@cipher/fhe-client/react";
import { useNetwork } from "@/lib/network";
import { BalanceRow } from "@/components/portfolio/BalanceRow";
import { PendingUnwraps } from "@/components/portfolio/PendingUnwraps";

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { chainId, actionable } = useNetwork();
  const pairs = usePairs({ chainId });
  const { ensureSession } = useFheSession();

  if (!isConnected || !address) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Your confidential portfolio</h1>
        <p className="text-sm text-surface-500">
          Connect a wallet to see your encrypted balances across every registered wrapper —
          revealed only to you, on demand.
        </p>
        <button
          type="button"
          onClick={() => connect({ connector: connectors[0]! })}
          className="rounded-chip bg-accent-soft px-4 py-2 text-sm font-medium text-accent-strong hover:bg-accent/20"
        >
          Connect wallet
        </button>
      </div>
    );
  }

  const revealAll = () => {
    if (!pairs.data) return;
    // One ensureSession over all wrappers (≤10 → exactly ONE signature);
    // individual rows then decrypt with zero further prompts.
    void ensureSession(pairs.data.map((p) => p.wrapper as Address)).then(() => {
      window.dispatchEvent(new CustomEvent("cipher:reveal-all"));
    });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
          <p className="mt-1 text-sm text-surface-600 dark:text-surface-300">
            Encrypted balances across {pairs.data?.length ?? "…"} registered wrappers.
          </p>
        </div>
        {actionable ? (
          <button
            type="button"
            onClick={revealAll}
            disabled={!pairs.data}
            className="ml-auto rounded-chip bg-accent-strong px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
            title="One signature covers every wrapper — reveals are then instant"
          >
            Reveal all (1 signature)
          </button>
        ) : null}
      </header>

      <PendingUnwraps chainId={chainId} account={address as Address} actionable={actionable} />

      <div className="overflow-x-auto rounded-lg border border-surface-200 dark:border-surface-700">
        <table className="w-full min-w-[480px] text-left">
          <thead>
            <tr className="border-b border-surface-200 text-xs uppercase tracking-wide text-surface-500 dark:border-surface-700">
              <th className="px-3 py-2.5 font-medium">Token</th>
              <th className="px-3 py-2.5 font-medium">Balance</th>
              <th className="px-3 py-2.5 text-right font-medium" />
            </tr>
          </thead>
          <tbody>
            {pairs.isPending
              ? Array.from({ length: 5 }, (_, i) => (
                  <tr key={i} className="border-b border-surface-100 last:border-0 dark:border-surface-800">
                    {Array.from({ length: 3 }, (_, j) => (
                      <td key={j} className="px-3 py-4">
                        <div className="h-4 animate-pulse-soft rounded bg-surface-200 dark:bg-surface-700" />
                      </td>
                    ))}
                  </tr>
                ))
              : pairs.data?.map((pair) => (
                  <MetaBalanceRow
                    key={pair.wrapper}
                    pair={pair}
                    chainId={chainId}
                    account={address as Address}
                    actionable={actionable}
                  />
                ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-surface-500">
        Nothing here yet?{" "}
        <Link href="/faucet" className="font-medium text-accent-strong underline underline-offset-2">
          Grab test tokens from the faucet
        </Link>{" "}
        and wrap them.
      </p>
    </div>
  );
}

function MetaBalanceRow({
  pair,
  chainId,
  account,
  actionable,
}: {
  pair: TokenWrapperPair;
  chainId: ChainId;
  account: Address;
  actionable: boolean;
}) {
  const { data: meta } = useWrapperMeta({ chainId, wrapper: pair.wrapper });
  if (!meta) {
    return (
      <tr className="border-b border-surface-100 last:border-0 dark:border-surface-800">
        <td colSpan={3} className="px-3 py-4">
          <div className="h-4 w-40 animate-pulse-soft rounded bg-surface-200 dark:bg-surface-700" />
        </td>
      </tr>
    );
  }
  return <BalanceRow meta={meta} chainId={chainId} account={account} actionable={actionable} />;
}
