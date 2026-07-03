import { ZERO_HANDLE } from "./constants.ts";
import { toRegistryError } from "./errors.ts";
import { getBalanceHandle } from "./wrapper-reads.ts";
import type { Address, FheAdapter, Hex, ReadCtx } from "./types.ts";

export interface DecryptedBalance {
  value: bigint;
  handle: Hex;
  /** True when the account has never held this token (zero handle — public info). */
  uninitialized: boolean;
}

/**
 * EIP-712 user-decryption of a confidential balance. Zero handles
 * short-circuit locally (no relayer round-trip, no signature) — callers must
 * still render them as "no activity", never as a revealed 0 of a real handle.
 */
export async function decryptBalance(
  ctx: ReadCtx & { fhe: FheAdapter },
  p: { wrapper: Address; account: Address },
): Promise<DecryptedBalance> {
  try {
    const handle = await getBalanceHandle(ctx, p.wrapper, p.account);
    if (handle === ZERO_HANDLE) {
      return { value: 0n, handle, uninitialized: true };
    }
    await ctx.fhe.ensureSession?.([p.wrapper]);
    const value = await ctx.fhe.userDecrypt({ handle, contractAddress: p.wrapper });
    return { value, handle, uninitialized: false };
  } catch (e) {
    throw toRegistryError(e);
  }
}
