"use client";

import { useAccount } from "wagmi";
import { EncryptedValue, ErrorToast, RevealButton } from "@cipher/ui";
import { useDecryptedBalance } from "@cipher/registry-sdk/react";
import type { Address, ChainId } from "@cipher/addresses";
import { useNetwork } from "@/lib/network";

export function BalanceCard({
  chainId,
  wrapper,
  symbol,
  decimals,
}: {
  chainId: ChainId;
  wrapper: Address;
  symbol: string;
  decimals: number;
}) {
  const { address } = useAccount();
  const { actionable } = useNetwork();
  const balance = useDecryptedBalance({ chainId, wrapper, account: address });

  return (
    <div className="rounded-lg border border-surface-200 p-4 dark:border-surface-700">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-surface-500">
            Your confidential balance
          </p>
          <div className="mt-1.5">
            {!address ? (
              <span className="text-sm text-surface-500">Connect a wallet to see your balance</span>
            ) : balance.uninitialized ? (
              <span className="text-sm text-surface-500">No activity yet</span>
            ) : (
              <EncryptedValue
                state={
                  balance.status === "revealed"
                    ? "revealed"
                    : balance.status === "revealing"
                      ? "decrypting"
                      : "undisclosed"
                }
                value={balance.value}
                decimals={decimals}
                symbol={symbol}
                className="text-2xl"
              />
            )}
          </div>
        </div>
        <div className="ml-auto">
          {address && !balance.uninitialized ? (
            actionable ? (
              <RevealButton
                phase={
                  balance.status === "revealing"
                    ? "decrypting"
                    : balance.status === "revealed"
                      ? "revealed"
                      : "idle"
                }
                onReveal={balance.reveal}
                disabled={!balance.handle}
              />
            ) : (
              <span
                className="rounded-chip bg-surface-100 px-3 py-1.5 text-xs text-surface-500 dark:bg-surface-800"
                title="Balance reveal is enabled on Sepolia — mainnet is read-only in this explorer"
              >
                Reveal available on Sepolia
              </span>
            )
          ) : null}
        </div>
      </div>
      {address && !balance.uninitialized ? (
        <p className="mt-3 text-xs text-surface-500">
          Ciphertext on-chain — Reveal decrypts locally via your signed session; nothing is published.
        </p>
      ) : null}
      {balance.error && balance.status === "error" ? (
        <div className="mt-3">
          <ErrorToast code={balance.error.code} detail={balance.error.message.slice(0, 120)} />
        </div>
      ) : null}
    </div>
  );
}
