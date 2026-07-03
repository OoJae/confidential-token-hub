"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { FheAdapter, KVStorage } from "../types.ts";

interface RegistrySdkContextValue {
  fhe?: FheAdapter;
  storage?: KVStorage;
}

const RegistrySdkContext = createContext<RegistrySdkContextValue>({});

/**
 * Optional provider carrying the FheAdapter (e.g. useFheAdapter() from
 * @cipher/fhe-client/react) + unwrap-record storage. Every READ hook works
 * with bare wagmi and no provider at all — only decrypt/unwrap/transfer
 * hooks need the adapter.
 */
export function RegistrySdkProvider({
  children,
  fhe,
  storage,
}: {
  children: ReactNode;
  fhe?: FheAdapter;
  storage?: KVStorage;
}) {
  const value = useMemo(() => ({ fhe, storage }), [fhe, storage]);
  return <RegistrySdkContext.Provider value={value}>{children}</RegistrySdkContext.Provider>;
}

export function useRegistrySdkContext(): RegistrySdkContextValue {
  return useContext(RegistrySdkContext);
}
