import type { Address, ChainId, Hex } from "../types.ts";

/** Query-key factory — everything under ["registry", chainId, ...]; bigints stringified. */
export const registryKeys = {
  pairs: (chainId: ChainId) => ["registry", chainId, "pairs"] as const,
  meta: (chainId: ChainId, wrapper: Address) => ["registry", chainId, "meta", wrapper] as const,
  balanceHandle: (chainId: ChainId, wrapper: Address, account: Address) =>
    ["registry", chainId, "balanceHandle", wrapper, account] as const,
  /** Keyed by HANDLE: a new handle is a new key — stale cleartext can never render (FHE rule 4). */
  revealed: (chainId: ChainId, wrapper: Address, handle: Hex) =>
    ["registry", chainId, "revealed", wrapper, handle] as const,
  isOperator: (chainId: ChainId, wrapper: Address, holder: Address, spender: Address) =>
    ["registry", chainId, "isOperator", wrapper, holder, spender] as const,
  pendingUnwraps: (chainId: ChainId, account: Address) =>
    ["registry", chainId, "pendingUnwraps", account] as const,
  allowance: (chainId: ChainId, underlying: Address, owner: Address, spender: Address) =>
    ["registry", chainId, "allowance", underlying, owner, spender] as const,
};
