import { CHAINS } from "@cipher/addresses";
import type { ChainId, Hex } from "./types.ts";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
export const ZERO_HANDLE = `0x${"0".repeat(64)}` as Hex;
export const MAX_UINT256 = 2n ** 256n - 1n;

/**
 * Registry deployment blocks (binary-searched via drpc archive eth_getCode,
 * 2026-07-03). Floor for pending-unwrap deep scans — a wrapper could in
 * theory predate the registry, but the local store recovers anything the
 * user did through this SDK regardless.
 */
export const SCAN_FROM_BLOCK: Record<ChainId, bigint> = {
  [CHAINS.sepolia]: 10_162_129n,
  [CHAINS.mainnet]: 24_096_655n,
};

/**
 * getLogs chunking (empirical, 2026-07-03): publicnode rejects eth_getLogs
 * entirely; drpc free tier serves ranges ≤ 10,000 blocks. Start at 10k and
 * halve adaptively on range-y errors, floor 2k.
 */
export const LOG_CHUNK_INITIAL = 10_000n;
export const LOG_CHUNK_FLOOR = 2_000n;

/** Default recent-window scan depth (~50k blocks ≈ 1 week of Sepolia). */
export const RECENT_SCAN_BLOCKS = 50_000n;

export const DEFAULT_PAGE_SIZE = 25;
