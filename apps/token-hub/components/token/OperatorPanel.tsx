"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { isAddress } from "viem";
import { AsyncTxStatus, ErrorToast, type FheErrorCode, type TxPhase } from "@cipher/ui";
import { useOperator } from "@cipher/registry-sdk/react";
import type { WrapperMeta } from "@cipher/registry-sdk";
import type { Address, ChainId } from "@cipher/addresses";
import { txUrl } from "@/lib/links";

const PRESETS = [
  { label: "1 hour", seconds: 3600 },
  { label: "24 hours", seconds: 86_400 },
  { label: "7 days", seconds: 604_800 },
] as const;

export function OperatorPanel({
  meta,
  chainId,
  disabled,
}: {
  meta: WrapperMeta;
  chainId: ChainId;
  disabled: boolean;
}) {
  const { address } = useAccount();
  const [operator, setOperator] = useState("");
  const [presetIdx, setPresetIdx] = useState(1);
  const [phase, setPhase] = useState<TxPhase>("idle");
  const [phaseMsg, setPhaseMsg] = useState<string>();
  const [lastTx, setLastTx] = useState<string>();
  const [error, setError] = useState<{ code: FheErrorCode; detail?: string } | null>(null);

  const validOperator = isAddress(operator);
  const ops = useOperator({
    chainId,
    wrapper: meta.wrapper,
    holder: address,
    spender: validOperator ? (operator as Address) : undefined,
  });

  const run = (kind: "set" | "revoke") => {
    if (!validOperator) return;
    setError(null);
    setPhase("submitting");
    setPhaseMsg(kind === "set" ? "Granting operator…" : "Revoking operator…");
    const handlers = {
      onSuccess: (res: { txHash: `0x${string}` }) => {
        setPhase("done");
        setPhaseMsg(kind === "set" ? "Operator granted" : "Operator revoked");
        setLastTx(res.txHash);
      },
      onError: (e: { code: string; message: string }) => {
        setPhase("error");
        setPhaseMsg(undefined);
        setError({ code: e.code as FheErrorCode, detail: e.message.slice(0, 140) });
      },
    };
    if (kind === "set") {
      const until = Math.floor(Date.now() / 1000) + PRESETS[presetIdx]!.seconds;
      ops.set.mutate({ operator: operator as Address, until }, handlers);
    } else {
      ops.revoke.mutate({ operator: operator as Address }, handlers);
    }
  };

  return (
    <div className="max-w-lg space-y-4">
      <p className="text-sm text-surface-600 dark:text-surface-300">
        An operator can move your confidential balance until the expiry — the delegation primitive
        protocols build on (airdrop distributors, vesting, routers). Grant deliberately, revoke
        freely.
      </p>

      <div>
        <label htmlFor="operator-addr" className="text-sm font-medium">
          Operator address
        </label>
        <input
          id="operator-addr"
          placeholder="0x…"
          value={operator}
          onChange={(e) => setOperator(e.target.value)}
          disabled={disabled}
          className="mt-1.5 w-full rounded-lg border border-surface-300 bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-accent disabled:opacity-50 dark:border-surface-600"
        />
        {validOperator && address ? (
          <p className="mt-1.5 text-xs text-surface-500">
            {ops.isOperator.isPending
              ? "Checking current status…"
              : ops.isOperator.data
                ? "✅ Currently an active operator for your account"
                : "Not currently an operator for your account"}
          </p>
        ) : null}
      </div>

      <div>
        <span className="text-sm font-medium">Expiry</span>
        <div className="mt-1.5 flex gap-2">
          {PRESETS.map((p, i) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setPresetIdx(i)}
              disabled={disabled}
              className={
                i === presetIdx
                  ? "rounded-chip bg-accent-strong px-3 py-1.5 text-xs font-medium text-white"
                  : "rounded-chip bg-surface-100 px-3 py-1.5 text-xs font-medium text-surface-600 hover:bg-surface-200 disabled:opacity-50 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700"
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => run("set")}
          disabled={disabled || !address || !validOperator || ops.set.isPending}
          className="flex-1 rounded-lg bg-accent-strong px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          title={disabled ? "Actions are live on Sepolia — mainnet is read-only" : undefined}
        >
          Grant until {PRESETS[presetIdx]!.label} from now
        </button>
        <button
          type="button"
          onClick={() => run("revoke")}
          disabled={disabled || !address || !validOperator || ops.revoke.isPending || !ops.isOperator.data}
          className="rounded-lg border border-danger/40 px-4 py-2.5 text-sm font-semibold text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Revoke
        </button>
      </div>

      <AsyncTxStatus phase={phase} message={phaseMsg} txUrl={lastTx ? txUrl(chainId, lastTx) : undefined} />
      {error ? <ErrorToast code={error.code} detail={error.detail} onDismiss={() => setError(null)} /> : null}
    </div>
  );
}
