import { REGISTRY } from "@cipher/addresses";
import { registryAbi } from "@cipher/addresses/abis";
import { DEFAULT_PAGE_SIZE, ZERO_ADDRESS } from "./constants.ts";
import { toRegistryError } from "./errors.ts";
import type { Address, ReadCtx } from "./types.ts";

export interface TokenWrapperPair {
  token: Address;
  wrapper: Address;
  isValid: boolean;
  index: number;
}

export function registryAddress(ctx: ReadCtx): Address {
  return ctx.registry ?? REGISTRY[ctx.chainId];
}

export async function getPairsLength(ctx: ReadCtx): Promise<bigint> {
  try {
    return await ctx.publicClient.readContract({
      address: registryAddress(ctx),
      abi: registryAbi,
      functionName: "getTokenConfidentialTokenPairsLength",
    });
  } catch (e) {
    throw toRegistryError(e);
  }
}

export async function getPairsSlice(
  ctx: ReadCtx,
  from: bigint,
  toExclusive: bigint,
): Promise<TokenWrapperPair[]> {
  try {
    const slice = await ctx.publicClient.readContract({
      address: registryAddress(ctx),
      abi: registryAbi,
      functionName: "getTokenConfidentialTokenPairsSlice",
      args: [from, toExclusive],
    });
    return slice.map((p, i) => ({
      token: p.tokenAddress,
      wrapper: p.confidentialTokenAddress,
      isValid: p.isValid,
      index: Number(from) + i,
    }));
  } catch (e) {
    throw toRegistryError(e);
  }
}

/**
 * Full enumeration via paginated slices (never the unbounded getter).
 * Race-safe against the registry growing/shrinking mid-pagination: on a
 * failing slice the length is re-read once and the window clamped. Entries
 * appended after the initial length read surface on the next refetch —
 * documented behavior.
 */
export async function listPairs(
  ctx: ReadCtx,
  opts?: { pageSize?: number },
): Promise<TokenWrapperPair[]> {
  const pageSize = BigInt(opts?.pageSize ?? DEFAULT_PAGE_SIZE);
  let length = await getPairsLength(ctx);
  const pairs: TokenWrapperPair[] = [];

  for (let from = 0n; from < length; from += pageSize) {
    const to = from + pageSize > length ? length : from + pageSize;
    try {
      pairs.push(...(await getPairsSlice(ctx, from, to)));
    } catch {
      // Registry may have shrunk mid-pagination — re-read once and clamp.
      length = await getPairsLength(ctx);
      if (length <= from) break;
      const clampedTo = from + pageSize > length ? length : from + pageSize;
      pairs.push(...(await getPairsSlice(ctx, from, clampedTo)));
    }
  }
  return pairs;
}

/**
 * null = never registered. Revoked pairs return { isValid: false } with the
 * real address — callers must surface them, never hide them.
 */
export async function getWrapperForToken(
  ctx: ReadCtx,
  token: Address,
): Promise<{ wrapper: Address; isValid: boolean } | null> {
  try {
    const [isValid, wrapper] = await ctx.publicClient.readContract({
      address: registryAddress(ctx),
      abi: registryAbi,
      functionName: "getConfidentialTokenAddress",
      args: [token],
    });
    if (wrapper === ZERO_ADDRESS) return null;
    return { wrapper, isValid };
  } catch (e) {
    throw toRegistryError(e);
  }
}

export async function getTokenForWrapper(
  ctx: ReadCtx,
  wrapper: Address,
): Promise<{ token: Address; isValid: boolean } | null> {
  try {
    const [isValid, token] = await ctx.publicClient.readContract({
      address: registryAddress(ctx),
      abi: registryAbi,
      functionName: "getTokenAddress",
      args: [wrapper],
    });
    if (token === ZERO_ADDRESS) return null;
    return { token, isValid };
  } catch (e) {
    throw toRegistryError(e);
  }
}

export async function isWrapperValid(ctx: ReadCtx, wrapper: Address): Promise<boolean> {
  try {
    return await ctx.publicClient.readContract({
      address: registryAddress(ctx),
      abi: registryAbi,
      functionName: "isConfidentialTokenValid",
      args: [wrapper],
    });
  } catch (e) {
    throw toRegistryError(e);
  }
}
