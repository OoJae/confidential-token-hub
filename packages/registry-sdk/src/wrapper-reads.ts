import { erc20Abi, erc7984WrapperAbi, registryAbi } from "@cipher/addresses/abis";
import { ZERO_ADDRESS } from "./constants.ts";
import { toRegistryError } from "./errors.ts";
import { registryAddress } from "./registry.ts";
import type { Address, Hex, ReadCtx } from "./types.ts";

export interface WrapperMeta {
  wrapper: Address;
  underlying: Address;
  name: string;
  symbol: string;
  decimals: number;
  rate: bigint;
  /** inferredTotalSupply() — "Total Value Shielded", wrapper base units. */
  tvs: bigint;
  /** maxTotalSupply() (= type(uint64).max for OZ wrappers). */
  maxSupply: bigint;
  /** Registry validity — revoked wrappers surface with false, never hidden. */
  isValid: boolean;
  /** null when the underlying is anomalous/non-standard — degrade, don't crash. */
  underlyingMeta: { name: string; symbol: string; decimals: number } | null;
}

/**
 * One multicall (allowFailure) for everything the detail page needs.
 * Anomalous wrappers/underlyings degrade field-by-field instead of throwing.
 */
export async function getWrapperMeta(ctx: ReadCtx, wrapper: Address): Promise<WrapperMeta> {
  try {
    const w = { address: wrapper, abi: erc7984WrapperAbi } as const;
    const first = await ctx.publicClient.multicall({
      allowFailure: true,
      contracts: [
        { ...w, functionName: "name" },
        { ...w, functionName: "symbol" },
        { ...w, functionName: "decimals" },
        { ...w, functionName: "rate" },
        { ...w, functionName: "underlying" },
        { ...w, functionName: "inferredTotalSupply" },
        { ...w, functionName: "maxTotalSupply" },
        {
          address: registryAddress(ctx),
          abi: registryAbi,
          functionName: "isConfidentialTokenValid",
          args: [wrapper],
        },
      ],
    });

    const val = <T>(i: number, fallback: T): T =>
      first[i]?.status === "success" ? (first[i]!.result as T) : fallback;

    const underlying = val<Address>(4, ZERO_ADDRESS);

    let underlyingMeta: WrapperMeta["underlyingMeta"] = null;
    if (underlying !== ZERO_ADDRESS) {
      const u = { address: underlying, abi: erc20Abi } as const;
      const second = await ctx.publicClient.multicall({
        allowFailure: true,
        contracts: [
          { ...u, functionName: "name" },
          { ...u, functionName: "symbol" },
          { ...u, functionName: "decimals" },
        ],
      });
      if (second.every((r) => r.status === "success")) {
        underlyingMeta = {
          name: second[0]!.result as string,
          symbol: second[1]!.result as string,
          decimals: Number(second[2]!.result),
        };
      }
    }

    return {
      wrapper,
      underlying,
      name: val(0, "Unknown wrapper"),
      symbol: val(1, "???"),
      decimals: Number(val(2, 6)),
      rate: val(3, 1n),
      tvs: val(5, 0n),
      maxSupply: val(6, 0n),
      isValid: val(7, false),
      underlyingMeta,
    };
  } catch (e) {
    throw toRegistryError(e);
  }
}

/** Raw encrypted balance handle (ZERO_HANDLE when uninitialized). */
export async function getBalanceHandle(
  ctx: ReadCtx,
  wrapper: Address,
  account: Address,
): Promise<Hex> {
  try {
    return await ctx.publicClient.readContract({
      address: wrapper,
      abi: erc7984WrapperAbi,
      functionName: "confidentialBalanceOf",
      args: [account],
    });
  } catch (e) {
    throw toRegistryError(e);
  }
}

export async function getIsOperator(
  ctx: ReadCtx,
  wrapper: Address,
  holder: Address,
  spender: Address,
): Promise<boolean> {
  try {
    return await ctx.publicClient.readContract({
      address: wrapper,
      abi: erc7984WrapperAbi,
      functionName: "isOperator",
      args: [holder, spender],
    });
  } catch (e) {
    throw toRegistryError(e);
  }
}

export async function getAllowance(
  ctx: ReadCtx,
  underlying: Address,
  owner: Address,
  spender: Address,
): Promise<bigint> {
  try {
    return await ctx.publicClient.readContract({
      address: underlying,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner, spender],
    });
  } catch (e) {
    throw toRegistryError(e);
  }
}
