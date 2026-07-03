"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { isAddress } from "viem";
import { AsyncTxStatus, ErrorToast, type FheErrorCode, type TxPhase } from "@cipher/ui";
import { useConfidentialTransfer } from "@cipher/registry-sdk/react";
import type { WrapperMeta } from "@cipher/registry-sdk";
import type { Address, ChainId } from "@cipher/addresses";
import { txUrl } from "@/lib/links";
import { parseAmount } from "./amount";

export function TransferForm({
  meta,
  chainId,
  disabled,
}: {
  meta: WrapperMeta;
  chainId: ChainId;
  disabled: boolean;
}) {
  const { address } = useAccount();
  const [to, setTo] = useState("");
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<TxPhase>("idle");
  const [lastTx, setLastTx] = useState<string>();
  const [error, setError] = useState<{ code: FheErrorCode; detail?: string } | null>(null);

  const transfer = useConfidentialTransfer({ chainId, wrapper: meta.wrapper });
  const amount = useMemo(() => parseAmount(input, meta.decimals), [input, meta.decimals]);
  const validTo = isAddress(to);

  const submit = () => {
    if (!validTo || amount === null || amount === 0n) return;
    setError(null);
    setPhase("encrypting");
    transfer.mutate(
      { to: to as Address, amount },
      {
        onSuccess: (res) => {
          setPhase("done");
          setLastTx(res.txHash);
          setInput("");
        },
        onError: (e) => {
          setPhase("error");
          setError({ code: e.code as FheErrorCode, detail: e.message.slice(0, 140) });
        },
      },
    );
  };

  return (
    <div className="max-w-lg space-y-4">
      <div className="rounded-lg border border-locked/30 bg-locked-bg/40 px-3 py-2.5 text-sm text-surface-600 dark:bg-surface-800 dark:text-surface-300">
        Amounts are encrypted end-to-end. Heads-up: a transfer of{" "}
        <strong>more than your balance succeeds on-chain but moves an encrypted 0</strong> — the
        chain can't reveal which. Reveal your balance afterwards to confirm.
      </div>

      <div>
        <label htmlFor="transfer-to" className="text-sm font-medium">
          Recipient
        </label>
        <input
          id="transfer-to"
          placeholder="0x…"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          disabled={disabled || !meta.isValid}
          className="mt-1.5 w-full rounded-lg border border-surface-300 bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-accent disabled:opacity-50 dark:border-surface-600"
        />
        {to && !validTo ? <p className="mt-1 text-xs text-danger">Not a valid address</p> : null}
      </div>

      <div>
        <label htmlFor="transfer-amount" className="text-sm font-medium">
          Amount ({meta.symbol})
        </label>
        <input
          id="transfer-amount"
          inputMode="decimal"
          placeholder="0.0"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={disabled || !meta.isValid}
          className="mt-1.5 w-full rounded-lg border border-surface-300 bg-transparent px-3 py-2 font-mono text-lg tabular-nums outline-none focus:border-accent disabled:opacity-50 dark:border-surface-600"
        />
      </div>

      {!meta.isValid ? (
        <p className="text-sm text-warning">Transfers are disabled — this wrapper was revoked.</p>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={
          disabled || !meta.isValid || !address || !validTo || amount === null || amount === 0n || transfer.isPending
        }
        className="w-full rounded-lg bg-accent-strong px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        title={disabled ? "Actions are live on Sepolia — mainnet is read-only" : undefined}
      >
        {transfer.isPending ? "Working…" : "Send confidentially"}
      </button>

      <AsyncTxStatus
        phase={transfer.isPending && phase === "encrypting" ? "encrypting" : phase}
        message={phase === "done" ? "Sent — amount stays encrypted on-chain" : undefined}
        txUrl={lastTx ? txUrl(chainId, lastTx) : undefined}
      />
      {error ? <ErrorToast code={error.code} detail={error.detail} onDismiss={() => setError(null)} /> : null}
    </div>
  );
}
