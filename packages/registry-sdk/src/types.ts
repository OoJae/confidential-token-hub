import type { PublicClient, TransactionReceipt, WalletClient } from "viem";
import type { ChainId } from "@cipher/addresses";

export type Address = `0x${string}`;
export type Hex = `0x${string}`;
export type { ChainId };

/**
 * Structural client types — anything with these methods works. Real viem
 * clients satisfy them; tests pass 3-line stubs.
 */
export type MinimalPublicClient = Pick<
  PublicClient,
  | "readContract"
  | "multicall"
  | "getLogs"
  | "getBlockNumber"
  | "waitForTransactionReceipt"
  | "getChainId"
>;
export type MinimalWalletClient = Pick<WalletClient, "writeContract" | "account" | "chain">;

export interface ReadCtx {
  chainId: ChainId;
  publicClient: MinimalPublicClient;
  /** Defaults to REGISTRY[chainId] — adding a chain = one @cipher/addresses entry. */
  registry?: Address;
}

export interface WriteCtx extends ReadCtx {
  walletClient: MinimalWalletClient;
}

export interface TxResult {
  txHash: Hex;
  receipt: TransactionReceipt;
}

/**
 * The injectable FHE boundary. Structurally identical to the trio exported by
 * @cipher/fhe-client (createFheAdapter) — implement it against any Zama SDK
 * instance, or mock it in tests. Read-only consumers never need it.
 */
export interface FheAdapter {
  encryptU64(p: {
    contractAddress: Address;
    userAddress: Address;
    value: bigint;
  }): Promise<{ handle: Hex; inputProof: Hex }>;
  userDecrypt(p: { handle: Hex; contractAddress: Address }): Promise<bigint>;
  publicDecrypt(handles: Hex[]): Promise<{
    clearValues: Readonly<Record<Hex, bigint | boolean | Hex>>;
    decryptionProof: Hex;
  }>;
  /** Optional: grant/refresh the EIP-712 decryption session (sign-once). */
  ensureSession?(contracts: Address[]): Promise<void>;
}

/** Same 3-method sync KV shape as @cipher/fhe-client's storage. */
export interface KVStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}
