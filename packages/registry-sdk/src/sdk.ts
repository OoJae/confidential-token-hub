import { RegistryError } from "./errors.ts";
import { decryptBalance } from "./decrypt.ts";
import { faucetMint } from "./faucet.ts";
import { confidentialTransfer } from "./transfer.ts";
import { revokeOperator, setOperator } from "./operator.ts";
import {
  getPairsLength,
  getPairsSlice,
  getTokenForWrapper,
  getWrapperForToken,
  isWrapperValid,
  listPairs,
} from "./registry.ts";
import { getAllowance, getBalanceHandle, getIsOperator, getWrapperMeta } from "./wrapper-reads.ts";
import { wrap, type WrapParams } from "./wrap.ts";
import { getPendingUnwraps } from "./unwrap/detect.ts";
import { unwrapFinalize, unwrapStart } from "./unwrap/machine.ts";
import { createUnwrapStore, defaultKV, type UnwrapStore } from "./unwrap/store.ts";
import type {
  Address,
  ChainId,
  FheAdapter,
  Hex,
  KVStorage,
  MinimalPublicClient,
  MinimalWalletClient,
  ReadCtx,
  WriteCtx,
} from "./types.ts";

export interface RegistrySdkConfig {
  chainId: ChainId;
  publicClient: MinimalPublicClient;
  /** Omit for a reads-only sdk (writes throw WALLET_REQUIRED). */
  walletClient?: MinimalWalletClient;
  /** Omit to skip FHE ops (decrypt/unwrap/transfer throw FHE_ADAPTER_REQUIRED). */
  fhe?: FheAdapter;
  registryAddress?: Address;
  storage?: KVStorage;
}

/**
 * Binds the free-function core to one chain + clients. The React hooks call
 * the free functions directly (per-chain clients from wagmi); this factory is
 * the Node/vanilla-TS entry — see the README's 10-line quickstart.
 */
export function createRegistrySdk(cfg: RegistrySdkConfig) {
  const readCtx: ReadCtx = {
    chainId: cfg.chainId,
    publicClient: cfg.publicClient,
    registry: cfg.registryAddress,
  };

  const writeCtx = (): WriteCtx => {
    if (!cfg.walletClient) {
      throw new RegistryError("WALLET_REQUIRED", "createRegistrySdk: pass walletClient for writes");
    }
    const chain = cfg.walletClient.chain;
    if (chain && chain.id !== cfg.chainId) {
      throw new RegistryError(
        "WRONG_NETWORK",
        `walletClient is on chain ${chain.id}, sdk is configured for ${cfg.chainId}`,
      );
    }
    return { ...readCtx, walletClient: cfg.walletClient };
  };

  const fhe = (): FheAdapter => {
    if (!cfg.fhe) {
      throw new RegistryError(
        "FHE_ADAPTER_REQUIRED",
        "createRegistrySdk: pass an FheAdapter (e.g. createFheAdapter from @cipher/fhe-client)",
      );
    }
    return cfg.fhe;
  };

  const storeFor = (account: Address): UnwrapStore =>
    createUnwrapStore(cfg.storage ?? defaultKV(), cfg.chainId, account);

  const accountAddress = (): Address => {
    const addr = cfg.walletClient?.account?.address;
    if (!addr) throw new RegistryError("WALLET_REQUIRED", "walletClient has no account");
    return addr as Address;
  };

  return {
    chainId: cfg.chainId,

    // ── registry reads ─────────────────────────────────────────────────
    listPairs: (opts?: { pageSize?: number }) => listPairs(readCtx, opts),
    getPairsLength: () => getPairsLength(readCtx),
    getPairsSlice: (from: bigint, toExclusive: bigint) => getPairsSlice(readCtx, from, toExclusive),
    getWrapperForToken: (token: Address) => getWrapperForToken(readCtx, token),
    getTokenForWrapper: (wrapper: Address) => getTokenForWrapper(readCtx, wrapper),
    isWrapperValid: (wrapper: Address) => isWrapperValid(readCtx, wrapper),

    // ── wrapper reads ──────────────────────────────────────────────────
    getWrapperMeta: (wrapper: Address) => getWrapperMeta(readCtx, wrapper),
    getBalanceHandle: (wrapper: Address, account: Address) =>
      getBalanceHandle(readCtx, wrapper, account),
    isOperator: (wrapper: Address, holder: Address, spender: Address) =>
      getIsOperator(readCtx, wrapper, holder, spender),
    getAllowance: (underlying: Address, owner: Address, spender: Address) =>
      getAllowance(readCtx, underlying, owner, spender),

    // ── actions ────────────────────────────────────────────────────────
    wrap: (params: WrapParams) => wrap(writeCtx(), params),
    faucetMint: (p: { underlying: Address; amount: bigint; to?: Address }) =>
      faucetMint(writeCtx(), p),
    setOperator: (p: { wrapper: Address; operator: Address; until: number }) =>
      setOperator(writeCtx(), p),
    revokeOperator: (p: { wrapper: Address; operator: Address }) => revokeOperator(writeCtx(), p),

    // ── FHE ops ────────────────────────────────────────────────────────
    decryptBalance: (wrapper: Address, account: Address) =>
      decryptBalance({ ...readCtx, fhe: fhe() }, { wrapper, account }),
    confidentialTransfer: (p: { wrapper: Address; to: Address; amount: bigint }) =>
      confidentialTransfer({ ...writeCtx(), fhe: fhe() }, p),
    unwrapStart: (p: { wrapper: Address; amount: bigint; from?: Address; to?: Address }) =>
      unwrapStart({ ...writeCtx(), fhe: fhe(), store: storeFor(accountAddress()) }, p),
    unwrapFinalize: (p: { wrapper: Address; requestId: Hex }) =>
      unwrapFinalize({ ...writeCtx(), fhe: fhe(), store: storeFor(accountAddress()) }, p),
    pendingUnwraps: (p: { account: Address; wrappers?: Address[]; depth?: "recent" | "full" }) =>
      (async () => {
        const wrappers = p.wrappers ?? (await listPairs(readCtx)).map((pair) => pair.wrapper);
        return getPendingUnwraps(
          { ...readCtx, store: storeFor(p.account) },
          { account: p.account, wrappers, depth: p.depth },
        );
      })(),
  };
}

export type RegistrySdk = ReturnType<typeof createRegistrySdk>;
