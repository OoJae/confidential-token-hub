"use client";

import { useMemo, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { erc20Abi } from "@cipher/addresses/abis";
import { AsyncTxStatus, ErrorToast, formatUnits, type FheErrorCode, type TxPhase } from "@cipher/ui";
import { useWrap } from "@cipher/registry-sdk/react";
import type { WrapperMeta } from "@cipher/registry-sdk";
import type { ChainId } from "@cipher/addresses";
import { txUrl } from "@/lib/links";
import { parseAmount } from "./amount";

export function WrapForm({
  meta,
  chainId,
  disabled,
}: {
  meta: WrapperMeta;
  chainId: ChainId;
  disabled: boolean;
}) {
  const { address } = useAccount();
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<TxPhase>("idle");
  const [phaseMsg, setPhaseMsg] = useState<string>();
  const [lastTx, setLastTx] = useState<string>();
  const [error, setError] = useState<{ code: FheErrorCode; detail?: string } | null>(null);

  const undDecimals = meta.underlyingMeta?.decimals ?? meta.decimals;
  const undSymbol = meta.underlyingMeta?.symbol ?? "tokens";

  const { data: underlyingBalance } = useReadContract({
    chainId,
    address: meta.underlying,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const wrapMutation = useWrap({ chainId, wrapper: meta.wrapper });

  const amount = useMemo(() => parseAmount(input, undDecimals), [input, undDecimals]);
  const math = useMemo(() => {
    if (amount === null || amount === 0n) return null;
    const minted = amount / meta.rate;
    const consumed = minted * meta.rate;
    const remainder = amount - consumed;
    return { minted, consumed, remainder, roundsToZero: minted === 0n };
  }, [amount, meta.rate]);

  const insufficient =
    amount !== null && underlyingBalance !== undefined && amount > underlyingBalance;

  const submit = () => {
    if (amount === null || !math || math.roundsToZero) return;
    setError(null);
    setLastTx(undefined);
    setPhase("submitting");
    setPhaseMsg(`Waiting for wallet…`);
    wrapMutation.mutate(
      {
        amount,
        onApproveSubmitted: (h) => {
          setPhase("mining");
          setPhaseMsg(`Approving ${undSymbol}…`);
          setLastTx(h);
        },
        onWrapSubmitted: (h) => {
          setPhase("mining");
          setPhaseMsg(`Wrapping…`);
          setLastTx(h);
        },
      },
      {
        onSuccess: (res) => {
          setPhase("done");
          setPhaseMsg(
            `Wrapped — ${formatUnits(res.minted, meta.decimals)} ${meta.symbol} credited`,
          );
          setLastTx(res.txHash);
          setInput("");
        },
        onError: (e) => {
          setPhase("error");
          setPhaseMsg(undefined);
          setError({ code: e.code as FheErrorCode, detail: e.message.slice(0, 140) });
        },
      },
    );
  };

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="wrap-amount" className="text-sm font-medium">
            Amount to wrap ({undSymbol})
          </label>
          {underlyingBalance !== undefined ? (
            <button
              type="button"
              className="text-xs text-surface-500 hover:text-surface-700 dark:hover:text-surface-300"
              onClick={() => setInput(formatUnits(underlyingBalance, undDecimals).replaceAll(",", ""))}
            >
              Balance: {formatUnits(underlyingBalance, undDecimals)}
            </button>
          ) : null}
        </div>
        <input
          id="wrap-amount"
          inputMode="decimal"
          placeholder="0.0"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={disabled || !meta.isValid}
          className="mt-1.5 w-full rounded-lg border border-surface-300 bg-transparent px-3 py-2 font-mono text-lg tabular-nums outline-none focus:border-accent disabled:opacity-50 dark:border-surface-600"
        />
      </div>

      {math && !math.roundsToZero ? (
        <div className="rounded-lg bg-surface-100 px-3 py-2.5 text-sm text-surface-600 dark:bg-surface-800 dark:text-surface-300">
          You'll receive{" "}
          <strong className="font-mono">
            {formatUnits(math.minted, meta.decimals)} {meta.symbol}
          </strong>
          .
          {math.remainder > 0n ? (
            <>
              {" "}
              {formatUnits(math.remainder, undDecimals)} {undSymbol} is below the conversion rate
              and <strong>stays in your wallet</strong> (rate{" "}
              {meta.rate === 1n ? "1:1" : `1e${meta.rate.toString().length - 1}`} — minimum wrap{" "}
              {formatUnits(meta.rate, undDecimals)} {undSymbol}).
            </>
          ) : null}
        </div>
      ) : null}

      {math?.roundsToZero ? (
        <ErrorToast
          code="ROUNDED_TO_ZERO"
          detail={`Minimum wrap is ${formatUnits(meta.rate, undDecimals)} ${undSymbol}`}
        />
      ) : null}
      {insufficient ? (
        <p className="text-sm text-danger">
          Amount exceeds your {undSymbol} balance.
        </p>
      ) : null}
      {!meta.isValid ? (
        <p className="text-sm text-warning">Wrapping is disabled — this wrapper was revoked.</p>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={
          disabled ||
          !meta.isValid ||
          !address ||
          amount === null ||
          amount === 0n ||
          !!math?.roundsToZero ||
          insufficient ||
          wrapMutation.isPending
        }
        className="w-full rounded-lg bg-accent-strong px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        title={disabled ? "Actions are live on Sepolia — mainnet is read-only" : undefined}
      >
        {wrapMutation.isPending ? "Working…" : "Approve & Wrap"}
      </button>

      <AsyncTxStatus
        phase={phase}
        message={phaseMsg}
        txUrl={lastTx ? txUrl(chainId, lastTx) : undefined}
      />
      {error ? <ErrorToast code={error.code} detail={error.detail} onDismiss={() => setError(null)} /> : null}
    </div>
  );
}
