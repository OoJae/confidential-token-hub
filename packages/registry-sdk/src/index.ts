// @cipher/registry-sdk — typed SDK for the Confidential Token Wrappers
// Registry + ERC-7984 wrappers. Pure-viem core: read-only consumers need no
// WASM, no relayer, no @zama-fhe install. FHE ops go through the injectable
// FheAdapter (see @cipher/fhe-client's createFheAdapter). React hooks: "./react".

export { createRegistrySdk, type RegistrySdk, type RegistrySdkConfig } from "./sdk.ts";

export {
  listPairs,
  getPairsLength,
  getPairsSlice,
  getWrapperForToken,
  getTokenForWrapper,
  isWrapperValid,
  registryAddress,
  type TokenWrapperPair,
} from "./registry.ts";
export {
  getWrapperMeta,
  getBalanceHandle,
  getIsOperator,
  getAllowance,
  type WrapperMeta,
} from "./wrapper-reads.ts";
export { wrap, type WrapParams, type WrapResult } from "./wrap.ts";
export { faucetMint } from "./faucet.ts";
export { decryptBalance, type DecryptedBalance } from "./decrypt.ts";
export { confidentialTransfer } from "./transfer.ts";
export { setOperator, revokeOperator } from "./operator.ts";
export {
  unwrapStart,
  unwrapFinalize,
  type UnwrapStartResult,
  type UnwrapFinalizeResult,
} from "./unwrap/machine.ts";
export { getPendingUnwraps, scanUnwrapRequested, type PendingUnwrap } from "./unwrap/detect.ts";
export {
  createUnwrapStore,
  defaultKV,
  unwrapStoreKey,
  type UnwrapRecord,
  type UnwrapStatus,
  type UnwrapStore,
} from "./unwrap/store.ts";
export { RegistryError, toRegistryError, FAUCET_CAP_SELECTOR, type RegistryErrorCode } from "./errors.ts";
export {
  SCAN_FROM_BLOCK,
  ZERO_HANDLE,
  ZERO_ADDRESS,
  MAX_UINT256,
  LOG_CHUNK_INITIAL,
  LOG_CHUNK_FLOOR,
  RECENT_SCAN_BLOCKS,
} from "./constants.ts";
export type {
  Address,
  Hex,
  ChainId,
  FheAdapter,
  KVStorage,
  MinimalPublicClient,
  MinimalWalletClient,
  ReadCtx,
  WriteCtx,
  TxResult,
} from "./types.ts";
