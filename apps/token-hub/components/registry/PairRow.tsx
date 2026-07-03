"use client";

import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { AddressChip, formatUnits } from "@cipher/ui";
import { useWrapperMeta } from "@cipher/registry-sdk/react";
import type { TokenWrapperPair } from "@cipher/registry-sdk";
import type { ChainId } from "@cipher/addresses";
import { tokenPath } from "@/lib/links";

export function PairRow({ pair, chainId }: { pair: TokenWrapperPair; chainId: ChainId }) {
  const router = useRouter();
  const { data: meta, isPending } = useWrapperMeta({ chainId, wrapper: pair.wrapper });

  return (
    <tr
      onClick={() => router.push(tokenPath(pair.wrapper, undefined, chainId))}
      className={clsx(
        "cursor-pointer border-b border-surface-100 transition-colors last:border-0 dark:border-surface-800",
        pair.isValid
          ? "hover:bg-surface-100/60 dark:hover:bg-surface-800/60"
          : "bg-warning/5 hover:bg-warning/10",
      )}
    >
      <td className="px-3 py-3">
        {isPending ? (
          <div className="h-4 w-24 animate-pulse-soft rounded bg-surface-200 dark:bg-surface-700" />
        ) : (
          <div>
            <p className="text-sm font-medium">{meta?.symbol ?? "???"}</p>
            <p className="text-xs text-surface-500">{meta?.name ?? "Unknown wrapper"}</p>
          </div>
        )}
      </td>
      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
        <AddressChip address={pair.wrapper} chainId={chainId} />
      </td>
      <td className="hidden px-3 py-3 md:table-cell" onClick={(e) => e.stopPropagation()}>
        <AddressChip address={pair.token} chainId={chainId} />
      </td>
      <td className="hidden px-3 py-3 text-right font-mono text-xs text-surface-500 sm:table-cell">
        {meta ? (meta.rate === 1n ? "1" : `1e${meta.rate.toString().length - 1}`) : "…"}
      </td>
      <td className="px-3 py-3 text-right font-mono text-sm tabular-nums">
        {meta ? (
          <>
            {formatUnits(meta.tvs, meta.decimals)}
            <span className="ml-1 text-xs text-surface-500">{meta.symbol}</span>
          </>
        ) : (
          "…"
        )}
      </td>
      <td className="px-3 py-3 text-right">
        {pair.isValid ? (
          <span className="inline-flex items-center gap-1 rounded-chip bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
            Active
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 rounded-chip bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning"
            title="Revoked by the Protocol DAO — visible for transparency; existing balances remain unwrappable"
          >
            ⚠ Revoked
          </span>
        )}
      </td>
    </tr>
  );
}
