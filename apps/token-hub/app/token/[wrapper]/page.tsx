"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useParams } from "next/navigation";
import { isAddress } from "viem";
import { AddressChip, formatUnits } from "@cipher/ui";
import { useWrapperMeta } from "@cipher/registry-sdk/react";
import type { Address } from "@cipher/addresses";
import { useNetwork } from "@/lib/network";
import { BalanceCard } from "@/components/token/BalanceCard";
import { ActionTabs } from "@/components/token/ActionTabs";

const UINT64_MAX = 2n ** 64n - 1n;

export default function TokenDetailPage() {
  const params = useParams<{ wrapper: string }>();
  const { chainId } = useNetwork();
  const wrapperParam = params.wrapper;
  const valid = typeof wrapperParam === "string" && isAddress(wrapperParam);
  const wrapper = valid ? (wrapperParam as Address) : undefined;

  const meta = useWrapperMeta({ chainId, wrapper });

  if (!valid) {
    return (
      <EmptyState title="Invalid address" body="That doesn't look like a contract address.">
        <BackLink />
      </EmptyState>
    );
  }

  if (meta.isPending) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse-soft rounded bg-surface-200 dark:bg-surface-700" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-24 animate-pulse-soft rounded-lg bg-surface-200 dark:bg-surface-700" />
          ))}
        </div>
      </div>
    );
  }

  if (meta.isError || !meta.data) {
    return (
      <EmptyState
        title="Not in the registry"
        body="This address isn't a registered confidential-token wrapper on the selected network."
      >
        <BackLink />
      </EmptyState>
    );
  }

  const m = meta.data;

  return (
    <div className="space-y-6">
      {!m.isValid ? (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
          <span className="text-lg leading-none">⚠</span>
          <div>
            <p className="font-semibold">Revoked by the Protocol DAO</p>
            <p className="mt-0.5 text-surface-600 dark:text-surface-300">
              Wrapping and transfers are disabled here. Existing balances remain fully unwrappable.
            </p>
          </div>
        </div>
      ) : null}

      <header className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{m.symbol}</h1>
          <span className="text-sm text-surface-500">{m.name}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-surface-500">
          <span className="flex items-center gap-1.5">
            Wrapper <AddressChip address={m.wrapper} chainId={chainId} />
          </span>
          <span className="flex items-center gap-1.5">
            Underlying <AddressChip address={m.underlying} chainId={chainId} />
            {m.underlyingMeta ? (
              <span className="text-xs">({m.underlyingMeta.symbol})</span>
            ) : (
              <span className="text-xs text-warning">(non-standard)</span>
            )}
          </span>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Rate"
          value={m.rate === 1n ? "1" : `1e${m.rate.toString().length - 1}`}
          hint="1 wrapper base unit = rate underlying base units. Amounts below the rate round to zero."
        />
        <Stat
          label="Decimals"
          value={`${m.underlyingMeta?.decimals ?? "?"} / ${m.decimals}`}
          hint="underlying / wrapper"
        />
        <Stat
          label="Total Value Shielded"
          value={`${formatUnits(m.tvs, m.decimals)} ${m.symbol}`}
          hint="inferredTotalSupply() — the wrapper's escrowed underlying balance is public; individual balances are not"
        />
        <Stat
          label="Max supply"
          value={m.maxSupply === UINT64_MAX ? "Uncapped (uint64 max)" : formatUnits(m.maxSupply, m.decimals)}
          hint="maxTotalSupply()"
        />
      </div>

      <BalanceCard chainId={chainId} wrapper={m.wrapper} symbol={m.symbol} decimals={m.decimals} />

      <Suspense fallback={null}>
        <ActionTabs meta={m} chainId={chainId} />
      </Suspense>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      className="rounded-lg border border-surface-200 p-4 dark:border-surface-700"
      title={hint}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-surface-500">{label}</p>
      <p className="mt-1 truncate font-mono text-lg tabular-nums" title={value}>
        {value}
      </p>
    </div>
  );
}

function EmptyState({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md space-y-3 py-16 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-surface-500">{body}</p>
      {children}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/"
      className="inline-block rounded-chip bg-accent-soft px-4 py-2 text-sm font-medium text-accent-strong hover:bg-accent/20"
    >
      ← Back to the explorer
    </Link>
  );
}
