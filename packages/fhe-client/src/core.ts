/**
 * SDK-instance-agnostic helpers shared by the React layer and the Node
 * client. All signatures verified against the installed @zama-fhe/sdk@3.2.0
 * (docs/SDK-VERIFICATION.md).
 */
import type { ZamaSDK } from "@zama-fhe/sdk";
import { FheError, toFheError } from "./errors.ts";

export type Hex = `0x${string}`;
export type Address = `0x${string}`;

export interface EncryptedInputResult {
  handle: Hex;
  inputProof: Hex;
}

/** Encrypt a uint64 for an externalEuint64 contract parameter. */
export async function encryptU64(
  sdk: ZamaSDK,
  params: { contractAddress: Address; userAddress: Address; value: bigint },
): Promise<EncryptedInputResult> {
  try {
    const { encryptedValues, inputProof } = await sdk.encrypt({
      values: [{ value: params.value, type: "euint64" }],
      contractAddress: params.contractAddress,
      userAddress: params.userAddress,
    });
    const handle = encryptedValues[0];
    if (!handle) throw new FheError("UNKNOWN", "encrypt returned no handles");
    return { handle, inputProof };
  } catch (e) {
    throw toFheError(e);
  }
}

/**
 * Grant-if-needed a decryption permit over `contracts`. Idempotent: when a
 * cached permit already covers the set, no wallet prompt happens. Returns
 * true iff a NEW EIP-712 signature was collected (the sign-once counter
 * increments on true).
 */
export async function ensurePermit(sdk: ZamaSDK, contracts: Address[]): Promise<boolean> {
  try {
    const covered = await sdk.permits.hasPermit(contracts);
    if (covered) return false;
    await sdk.permits.grantPermit(contracts);
    return true;
  } catch (e) {
    throw toFheError(e);
  }
}

/**
 * EIP-712 user-decryption of a single euint64 handle. The permit must already
 * cover `contractAddress` (call ensurePermit first — kept separate so callers
 * control exactly when a signature can be prompted).
 */
export async function userDecrypt(
  sdk: ZamaSDK,
  params: { handle: Hex; contractAddress: Address },
): Promise<bigint> {
  try {
    const result = await sdk.decryption.decryptValues([
      { encryptedValue: params.handle, contractAddress: params.contractAddress },
    ]);
    const clear = result[params.handle] ?? result[params.handle.toLowerCase() as Hex];
    if (typeof clear !== "bigint") {
      throw new FheError("UNKNOWN", `unexpected clear value for handle: ${String(clear)}`);
    }
    return clear;
  } catch (e) {
    throw toFheError(e);
  }
}

export interface PublicDecryptOutput {
  clearValues: Readonly<Record<Hex, bigint | boolean | Hex>>;
  abiEncodedClearValues: Hex;
  /** KMS-signed proof, submittable to ERC7984ERC20Wrapper.finalizeUnwrap. */
  decryptionProof: Hex;
}

/** Public decryption (proof-bearing) — used to finalize wrapper unwraps. */
export async function publicDecrypt(sdk: ZamaSDK, handles: Hex[]): Promise<PublicDecryptOutput> {
  try {
    return (await sdk.decryption.decryptPublicValues(handles)) as PublicDecryptOutput;
  } catch (e) {
    throw toFheError(e);
  }
}

/**
 * Bundle the trio (+ ensureSession) as the structural FheAdapter that
 * @cipher/registry-sdk (and any other consumer) injects — no package cycle,
 * this stays the only @zama-fhe importer in the suite.
 */
export function createFheAdapter(sdk: ZamaSDK) {
  return {
    encryptU64: (p: { contractAddress: Address; userAddress: Address; value: bigint }) =>
      encryptU64(sdk, p),
    userDecrypt: (p: { handle: Hex; contractAddress: Address }) => userDecrypt(sdk, p),
    publicDecrypt: (handles: Hex[]) => publicDecrypt(sdk, handles),
    ensureSession: async (contracts: Address[]) => {
      await ensurePermit(sdk, contracts);
    },
  };
}

export type CipherFheAdapter = ReturnType<typeof createFheAdapter>;
