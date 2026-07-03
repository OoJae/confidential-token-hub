// @cipher/fhe-client — the only place in the suite that touches @zama-fhe/*.
// Locked API surface: docs/SDK-VERIFICATION.md. React layer: "./react".
// Node scripts: "./node".

export { FheError, toFheError, type FheErrorCode } from "./errors.ts";
export { FHE_NETWORKS, requireCapability, type FheNetworkConfig } from "./config.ts";
export {
  createStorage,
  toGenericStorage,
  sessionKey,
  type StorageTier,
  type KVStorage,
  type GenericStorageLike,
} from "./storage.ts";
export {
  encryptU64,
  ensurePermit,
  userDecrypt,
  publicDecrypt,
  createFheAdapter,
  type CipherFheAdapter,
  type Address,
  type Hex,
  type EncryptedInputResult,
  type PublicDecryptOutput,
} from "./core.ts";
