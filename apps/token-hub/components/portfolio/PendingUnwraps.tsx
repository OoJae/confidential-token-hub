"use client";

import { useState } from "react";
import { AddressChip, AsyncTxStatus, ErrorToast, formatUnits, type FheErrorCode, type TxPhase } from "@cipher/ui";
import { usePendingUnwraps, useUnwrap, useWrapperMeta } from "@cipher/registry-sdk/react";
import type { PendingUnwrap } from "@cipher/registry-sdk";
import type { Address, ChainId } from "@cipher/addresses";
import { txUrl } from "@/lib/links";

export function PendingUnwraps({
  chainId,
  account,
  actionable,
}: {
  chainId: ChainId;
  account: Address;
  actionable: boolean;
}) {
  const pending = usePendingUnwraps({ chainId, account });

  if (!pending.data || pending.data.length === 0) return null;

  return (
    <section className="space-y-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
      <div>
        <h2 className="text-sm font-semibold">
          {pending.data.length} unfinalized unwrap{pending.data.length > 1 ? "s" : ""}
        </h2>
        <p className="mt-0.5 text-xs text-surface-500">
          Step 1 (the confidential burn) is done — finalize to publicly decrypt the amount and
          release the underlying. Detected from your local records plus an on-chain event scan.
        </p>
      </div>
      <ul className="space-y-2">
        {pending.data.map((r) => (
          <PendingRow key={r.requestId} record={r} chainId={chainId} actionable={actionable} />
        ))}
      </ul>
    </section>
  );
}

function PendingRow({
  record,
  chainId,
  actionable,
}: {
  record: PendingUnwrap;
  chainId: ChainId;
  actionable: boolean;
}) {
  const { data: meta } = useWrapperMeta({ chainId, wrapper: record.wrapper });
  const unwrap = useUnwrap({ chainId, wrapper: record.wrapper });
  const [phase, setPhase] = useState<TxPhase>("idle");
  const [error, setError] = useState<{ code: FheErrorCode; detail?: string } | null>(null);

  const finalize = async () => {
    setError(null);
    setPhase("decrypting");
    unwrap.resume(record.requestId);
    try {
      await unwrap.finalize(record.requestId);
      setPhase("done");
    } catch (e) {
      setPhase("error");
      const err = e as { code?: string; message?: string };
      setError({
        code: (err.code ?? "UNKNOWN") as FheErrorCode,
        detail: err.message?.slice(0, 120),
      });
    }
  };

  return (
    <li className="rounded-lg bg-surface-50 p-3 dark:bg-surface-900">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{meta?.symbol ?? "…"}</span>
        <span className="font-mono text-xs text-surface-500" title={record.requestId}>
          {record.requestId.slice(0, 10)}…{record.requestId.slice(-6)}
        </span>
        {record.requestTxHash ? (
          <AddressChip address={record.requestTxHash} chainId={chainId} kind="tx" />
        ) : null}
        <span className="ml-auto flex items-center gap-2">
          {unwrap.phase === "done" && unwrap.cleartext !== undefined && meta ? (
            <span className="text-xs text-success">
              +{formatUnits(unwrap.cleartext * meta.rate, meta.underlyingMeta?.decimals ?? meta.decimals)}{" "}
              {meta.underlyingMeta?.symbol ?? "underlying"}
              {unwrap.finalizeTxHash ? (
                <a
                  href={txUrl(chainId, unwrap.finalizeTxHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 underline underline-offset-2"
                >
                  tx ↗
                </a>
              ) : null}
            </span>
          ) : (
            <button
              type="button"
              disabled={!actionable || unwrap.phase === "finalizing"}
              onClick={() => void finalize()}
              className="rounded-chip bg-accent-strong px-3 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              title={!actionable ? "Finalize on Sepolia" : undefined}
            >
              {unwrap.phase === "finalizing" ? "Finalizing…" : "Finalize"}
            </button>
          )}
        </span>
      </div>
      {phase === "decrypting" && unwrap.phase === "finalizing" ? (
        <div className="mt-2">
          <AsyncTxStatus phase="decrypting" message="Publicly decrypting the amount…" />
        </div>
      ) : null}
      {error ? (
        <div className="mt-2">
          <ErrorToast code={error.code} detail={error.detail} onDismiss={() => setError(null)} />
        </div>
      ) : null}
    </li>
  );
}
