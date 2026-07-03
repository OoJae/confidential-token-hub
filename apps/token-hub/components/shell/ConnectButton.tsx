"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { AddressChip } from "@cipher/ui";
import { useNetwork } from "@/lib/network";

export function ConnectButton() {
  const { address, chainId: walletChainId, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { chainId, setChain, actionable } = useNetwork();

  if (!isConnected || !address) {
    return (
      <button
        type="button"
        onClick={() => connect({ connector: connectors[0]! })}
        className="rounded-chip bg-accent-soft px-4 py-2 text-sm font-medium text-accent-strong transition-colors hover:bg-accent/20"
      >
        Connect wallet
      </button>
    );
  }

  const wrongNetwork = actionable && walletChainId !== chainId;

  return (
    <div className="flex items-center gap-2">
      {wrongNetwork ? (
        <button
          type="button"
          onClick={() => setChain(chainId)}
          className="rounded-chip bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning hover:bg-warning/25"
          title="Your wallet is on a different network"
        >
          Wrong network — switch
        </button>
      ) : null}
      <AddressChip address={address} chainId={chainId} />
      <button
        type="button"
        onClick={() => disconnect()}
        aria-label="Disconnect"
        className="rounded p-1 text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-700"
        title="Disconnect"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="size-4" aria-hidden>
          <path d="M6 2a1 1 0 0 0 0 2h5v8H6a1 1 0 1 0 0 2h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H6Zm.7 3.3a1 1 0 0 0-1.4 0L3.3 7.3a1 1 0 0 0 0 1.4l2 2a1 1 0 0 0 1.4-1.4L6.4 9H10a1 1 0 1 0 0-2H6.4l.3-.3a1 1 0 0 0 0-1.4Z" />
        </svg>
      </button>
    </div>
  );
}
