"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSwitchChain } from "wagmi";
import { CHAINS, type ChainId } from "@cipher/addresses";

const STORAGE_KEY = "token-hub:chain";

interface NetworkContextValue {
  /** The chain the UI reads from. Actions are live only on Sepolia. */
  chainId: ChainId;
  /** True when actions (wrap/unwrap/faucet/…) are available. */
  actionable: boolean;
  setChain: (chainId: ChainId) => void;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

/**
 * App-level selected-chain store, one-way synced to the wallet. Initial
 * render is always Sepolia (no hydration mismatch); the persisted choice
 * hydrates in an effect.
 */
export function NetworkProvider({ children }: { children: ReactNode }) {
  const [chainId, setChainId] = useState<ChainId>(CHAINS.sepolia);
  const { switchChain } = useSwitchChain();

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && Number(stored) === CHAINS.mainnet) setChainId(CHAINS.mainnet);
    } catch {
      /* private mode */
    }
  }, []);

  const setChain = useCallback(
    (next: ChainId) => {
      setChainId(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      // Best-effort: bring the wallet along. Failure is non-fatal for reads.
      try {
        switchChain({ chainId: next });
      } catch {
        /* not connected / rejected */
      }
    },
    [switchChain],
  );

  const value = useMemo(
    () => ({ chainId, actionable: chainId === CHAINS.sepolia, setChain }),
    [chainId, setChain],
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork(): NetworkContextValue {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error("useNetwork must be used inside <NetworkProvider>");
  return ctx;
}
