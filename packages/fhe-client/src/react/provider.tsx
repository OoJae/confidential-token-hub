"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useConfig } from "wagmi";
import { ZamaProvider, useZamaSDK } from "@zama-fhe/react-sdk";
import { createConfig as createZamaWagmiConfig } from "@zama-fhe/react-sdk/wagmi";
import { sepolia as sepoliaFhe } from "@zama-fhe/sdk/chains";
import { web } from "@zama-fhe/sdk/web";
import { ensurePermit, type Address } from "../core.ts";
import { toFheError } from "../errors.ts";
import { toGenericStorage, type StorageTier } from "../storage.ts";

export interface CipherFheProviderProps {
  children: ReactNode;
  /**
   * Contracts included in every permit grant (the address book's wrappers).
   * One signature covers reveals across all of them (chunks of ≤10 per prompt).
   */
  baseContracts?: Address[];
  /** Credential storage tier. Default "session" (tab-scoped). */
  storage?: StorageTier;
  /** Transport keypair TTL in seconds. Default 7 days. */
  transportKeyPairTTL?: number;
  /** Permit lifetime in days (clamped by the SDK to the keypair TTL). Default 7. */
  permitTTL?: number;
}

interface FheSessionContextValue {
  /** EIP-712 permit prompts collected this tab session (the sign-once meter). */
  signCount: number;
  /**
   * Grant-if-needed a permit covering `contracts` (unioned with baseContracts).
   * Resolves without a prompt when the cached permit already covers the set.
   */
  ensureSession: (contracts: Address[]) => Promise<void>;
  /** Wipe transport keypair + permits (next reveal will re-prompt once). */
  invalidate: () => Promise<void>;
}

const FheSessionContext = createContext<FheSessionContextValue | null>(null);

/**
 * Mount INSIDE WagmiProvider + QueryClientProvider:
 *   <WagmiProvider><QueryClientProvider>
 *     <CipherFheProvider baseContracts={...}>{children}</CipherFheProvider>
 *   </QueryClientProvider></WagmiProvider>
 */
export function CipherFheProvider({
  children,
  baseContracts = [],
  storage = "session",
  transportKeyPairTTL = 7 * 24 * 60 * 60,
  permitTTL = 7,
}: CipherFheProviderProps) {
  const wagmiConfig = useConfig();

  const zamaConfig = useMemo(
    () =>
      createZamaWagmiConfig({
        chains: [sepoliaFhe],
        relayers: { [sepoliaFhe.id]: web() },
        wagmiConfig,
        storage: toGenericStorage(storage),
        transportKeyPairTTL,
        permitTTL,
      }),
    [wagmiConfig, storage, transportKeyPairTTL, permitTTL],
  );

  return (
    <ZamaProvider config={zamaConfig}>
      <FheSessionProvider baseContracts={baseContracts}>{children}</FheSessionProvider>
    </ZamaProvider>
  );
}

function FheSessionProvider({
  children,
  baseContracts,
}: {
  children: ReactNode;
  baseContracts: Address[];
}) {
  const sdk = useZamaSDK();
  const [signCount, setSignCount] = useState(0);
  // Serialize concurrent ensureSession calls so two parallel reveals can't
  // both prompt for the same permit.
  const pending = useRef<Promise<void> | null>(null);

  const ensureSession = useCallback(
    async (contracts: Address[]) => {
      const target = dedupe([...baseContracts, ...contracts]);
      const run = async () => {
        const signed = await ensurePermit(sdk, target);
        if (signed) setSignCount((c) => c + 1);
      };
      const chained = (pending.current ?? Promise.resolve()).then(run, run);
      pending.current = chained.catch(() => undefined);
      return chained;
    },
    [sdk, baseContracts],
  );

  const invalidate = useCallback(async () => {
    try {
      await sdk.permits.clear();
    } catch (e) {
      throw toFheError(e);
    }
  }, [sdk]);

  const value = useMemo(
    () => ({ signCount, ensureSession, invalidate }),
    [signCount, ensureSession, invalidate],
  );

  return <FheSessionContext.Provider value={value}>{children}</FheSessionContext.Provider>;
}

export function useFheSession(): FheSessionContextValue {
  const ctx = useContext(FheSessionContext);
  if (!ctx) throw new Error("useFheSession must be used inside <CipherFheProvider>");
  return ctx;
}

function dedupe(addresses: Address[]): Address[] {
  const seen = new Set<string>();
  return addresses.filter((a) => {
    const k = a.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
