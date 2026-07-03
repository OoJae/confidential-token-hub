"use client";

import { CHAINS, MINT_CAP_WHOLE, SEPOLIA_MOCKS } from "@cipher/addresses";
import { useNetwork } from "@/lib/network";
import { FaucetCard } from "@/components/faucet/FaucetCard";

export default function FaucetPage() {
  const { chainId, setChain, actionable } = useNetwork();

  if (!actionable) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Faucet is a Sepolia thing</h1>
        <p className="text-sm text-surface-500">
          The mock tokens with an open <code className="font-mono">mint()</code> only exist on the
          test network. Mainnet is read-only here.
        </p>
        <button
          type="button"
          onClick={() => setChain(CHAINS.sepolia)}
          className="rounded-chip bg-accent-soft px-4 py-2 text-sm font-medium text-accent-strong hover:bg-accent/20"
        >
          Switch to Sepolia
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Test-token faucet</h1>
        <p className="max-w-2xl text-sm text-surface-600 dark:text-surface-300">
          Seven mock underlyings with an open mint — max{" "}
          {MINT_CAP_WHOLE.toLocaleString("en-US")} whole tokens per call. Mint, then wrap into the
          confidential token in one click.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SEPOLIA_MOCKS.map((mock) => (
          <FaucetCard key={mock.underlying} mock={mock} />
        ))}
      </div>
      <p className="text-xs text-surface-500">chain: {chainId} · amounts convert per-token decimals (6 or 18) automatically</p>
    </div>
  );
}
