"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { clsx } from "clsx";
import { erc20Abi } from "@cipher/addresses/abis";
import { AddressChip, AsyncTxStatus, ErrorToast, formatUnits, type FheErrorCode, type TxPhase } from "@cipher/ui";
import { useFaucetMint } from "@cipher/registry-sdk/react";
import { CHAINS, MINT_CAP_WHOLE, toBaseUnits, type MockPair } from "@cipher/addresses";
import { txUrl, tokenPath } from "@/lib/links";

const PRESETS = [100n, 1_000n, 10_000n] as const;

export function FaucetCard({ mock }: { mock: MockPair }) {
  const { address } = useAccount();
  const [whole, setWhole] = useState<bigint>(1_000n);
  const [custom, setCustom] = useState("");
  const [phase, setPhase] = useState<TxPhase>("idle");
  const [lastTx, setLastTx] = useState<string>();
  const [minted, setMinted] = useState(false);
  const [error, setError] = useState<{ code: FheErrorCode; detail?: string } | null>(null);

  const mint = useFaucetMint({ chainId: CHAINS.sepolia });

  const { data: balance, refetch } = useReadContract({
    chainId: CHAINS.sepolia,
    address: mock.underlying,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const effectiveWhole = custom ? safeBigInt(custom) : whole;
  const overCap = effectiveWhole !== null && effectiveWhole > MINT_CAP_WHOLE;
  const underlyingSymbol = mock.symbol.replace(/^c/, "");

  const submit = () => {
    if (!address || effectiveWhole === null || effectiveWhole === 0n || overCap) return;
    setError(null);
    setMinted(false);
    setPhase("submitting");
    mint.mutate(
      { underlying: mock.underlying, amount: toBaseUnits(effectiveWhole, mock.underlyingDecimals) },
      {
        onSuccess: (res) => {
          setPhase("done");
          setLastTx(res.txHash);
          setMinted(true);
          void refetch();
        },
        onError: (e) => {
          setPhase("error");
          setError({ code: e.code as FheErrorCode, detail: e.message.slice(0, 120) });
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-surface-200 p-4 dark:border-surface-700">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{underlyingSymbol}Mock</p>
          <p className="text-xs text-surface-500">{mock.underlyingDecimals} decimals</p>
        </div>
        <AddressChip address={mock.underlying} chainId={CHAINS.sepolia} />
      </div>

      {address && balance !== undefined ? (
        <p className="text-xs text-surface-500">
          Your balance:{" "}
          <span className="font-mono tabular-nums">
            {formatUnits(balance, mock.underlyingDecimals)}
          </span>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.toString()}
            type="button"
            onClick={() => {
              setWhole(p);
              setCustom("");
            }}
            className={clsx(
              "rounded-chip px-2.5 py-1 text-xs font-medium transition-colors",
              !custom && whole === p
                ? "bg-accent-strong text-white"
                : "bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700",
            )}
          >
            {p.toLocaleString("en-US")}
          </button>
        ))}
        <input
          inputMode="numeric"
          placeholder="custom"
          value={custom}
          onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ""))}
          className="w-20 rounded-chip border border-surface-200 bg-transparent px-2 py-1 text-xs outline-none focus:border-accent dark:border-surface-700"
        />
      </div>

      {overCap ? (
        <p className="text-xs text-danger">
          Max {MINT_CAP_WHOLE.toLocaleString("en-US")} whole tokens per mint call.
        </p>
      ) : null}

      {minted ? (
        <Link
          href={tokenPath(mock.wrapper, "wrap")}
          className="rounded-lg bg-success/15 px-3 py-2 text-center text-sm font-semibold text-success transition-colors hover:bg-success/25"
        >
          {effectiveWhole?.toLocaleString("en-US")} {underlyingSymbol} minted → Wrap it
        </Link>
      ) : (
        <button
          type="button"
          onClick={submit}
          disabled={!address || mint.isPending || effectiveWhole === null || effectiveWhole === 0n || overCap}
          className="rounded-lg bg-accent-strong px-3 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {mint.isPending ? "Minting…" : `Mint ${effectiveWhole?.toLocaleString("en-US") ?? "…"}`}
        </button>
      )}

      <AsyncTxStatus
        phase={phase === "done" && minted ? "idle" : phase}
        txUrl={lastTx ? txUrl(CHAINS.sepolia, lastTx) : undefined}
      />
      {error ? <ErrorToast code={error.code} detail={error.detail} onDismiss={() => setError(null)} /> : null}
    </div>
  );
}

function safeBigInt(s: string): bigint | null {
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}
