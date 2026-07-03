"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { EncryptedValue, RevealButton } from "@cipher/ui";
import { useDecryptedBalance } from "@cipher/registry-sdk/react";
import type { WrapperMeta } from "@cipher/registry-sdk";
import type { Address, ChainId } from "@cipher/addresses";
import { tokenPath } from "@/lib/links";

export function BalanceRow({
  meta,
  chainId,
  account,
  actionable,
}: {
  meta: WrapperMeta;
  chainId: ChainId;
  account: Address;
  actionable: boolean;
}) {
  const balance = useDecryptedBalance({ chainId, wrapper: meta.wrapper, account });

  // "Reveal all": the portfolio header grants ONE session over every wrapper,
  // then broadcasts — each row decrypts with zero further prompts.
  const balanceRef = useRef(balance);
  balanceRef.current = balance;
  useEffect(() => {
    const onRevealAll = () => {
      const b = balanceRef.current;
      if (b.status === "undisclosed" && !b.uninitialized) b.reveal();
    };
    window.addEventListener("cipher:reveal-all", onRevealAll);
    return () => window.removeEventListener("cipher:reveal-all", onRevealAll);
  }, []);

  return (
    <tr className="border-b border-surface-100 last:border-0 dark:border-surface-800">
      <td className="px-3 py-3">
        <Link href={tokenPath(meta.wrapper, undefined, chainId)} className="group">
          <p className="text-sm font-medium group-hover:underline group-hover:underline-offset-2">
            {meta.symbol}
          </p>
          <p className="text-xs text-surface-500">{meta.name}</p>
        </Link>
      </td>
      <td className="px-3 py-3">
        {balance.uninitialized ? (
          <span className="text-sm text-surface-400">No activity yet</span>
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
            decimals={meta.decimals}
            symbol={meta.symbol}
          />
        )}
      </td>
      <td className="px-3 py-3 text-right">
        {!balance.uninitialized ? (
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
            <span className="text-xs text-surface-400" title="Reveal is enabled on Sepolia">
              Sepolia only
            </span>
          )
        ) : null}
      </td>
    </tr>
  );
}
