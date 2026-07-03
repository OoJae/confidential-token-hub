"use client";

import { useState, type ReactNode } from "react";
import { WagmiProvider, createConfig, fallback, http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CipherFheProvider } from "@cipher/fhe-client/react";
import { useFheAdapter } from "@cipher/fhe-client/react";
import { RegistrySdkProvider } from "@cipher/registry-sdk/react";
import { SEPOLIA_MOCKS } from "@cipher/addresses";
import { NetworkProvider } from "@/lib/network";

// publicnode serves everything except eth_getLogs (403); drpc serves getLogs
// in ≤10k-block chunks — the fallback transport covers both.
const wagmiConfig = createConfig({
  chains: [sepolia, mainnet],
  connectors: [injected()],
  transports: {
    [sepolia.id]: fallback([
      http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com"),
      http("https://sepolia.drpc.org"),
    ]),
    [mainnet.id]: fallback([
      http(process.env.NEXT_PUBLIC_MAINNET_RPC_URL ?? "https://ethereum-rpc.publicnode.com"),
      http("https://eth.drpc.org"),
    ]),
  },
});

/** Bridges the sign-once FHE session into registry-sdk (must sit inside CipherFheProvider). */
function RegistryBridge({ children }: { children: ReactNode }) {
  const fhe = useFheAdapter();
  return <RegistrySdkProvider fhe={fhe}>{children}</RegistrySdkProvider>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <NetworkProvider>
          <CipherFheProvider baseContracts={SEPOLIA_MOCKS.map((m) => m.wrapper)}>
            <RegistryBridge>{children}</RegistryBridge>
          </CipherFheProvider>
        </NetworkProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
