import { parseAbiItem } from "viem";
import { erc7984WrapperAbi } from "@cipher/addresses/abis";
import {
  LOG_CHUNK_FLOOR,
  LOG_CHUNK_INITIAL,
  RECENT_SCAN_BLOCKS,
  SCAN_FROM_BLOCK,
  ZERO_ADDRESS,
} from "../constants.ts";
import { toRegistryError } from "../errors.ts";
import type { Address, Hex, ReadCtx } from "../types.ts";
import type { UnwrapStore } from "./store.ts";

const UNWRAP_REQUESTED = parseAbiItem(
  "event UnwrapRequested(address indexed receiver, bytes32 indexed unwrapRequestId, bytes32 amount)",
);

export interface PendingUnwrap {
  requestId: Hex;
  wrapper: Address;
  receiver: Address;
  requestTxHash?: Hex;
  requestBlock?: bigint;
  source: "local" | "scan" | "both";
}

// Match block-RANGE policy errors only — "rate limit exceeded" must NOT halve
// the chunk (it's skipped instead); hence no bare "limit"/"exceed" terms.
const isRangeError = (e: unknown): boolean =>
  /block range|ranges? over|range .*not supported|10000|10 000|too many (logs|results)|response size/i.test(
    e instanceof Error ? e.message : String(e),
  );

/**
 * Chunked, adaptive UnwrapRequested scan filtered by receiver. Empirical
 * (2026-07-03): publicnode rejects eth_getLogs entirely, drpc free tier
 * serves ≤10k-block ranges — start at 10k, halve on range errors, floor 2k.
 * Individual chunk failures after halving are skipped (partial results beat
 * none); the watermark only advances past fully scanned prefixes.
 */
export async function scanUnwrapRequested(
  ctx: ReadCtx,
  p: { account: Address; wrappers: Address[]; fromBlock: bigint; toBlock: bigint },
): Promise<{ logs: { requestId: Hex; wrapper: Address; txHash: Hex; block: bigint }[]; fullyScanned: boolean }> {
  const out: { requestId: Hex; wrapper: Address; txHash: Hex; block: bigint }[] = [];
  let chunk = LOG_CHUNK_INITIAL;
  let from = p.fromBlock;
  let fullyScanned = true;

  while (from <= p.toBlock) {
    const to = from + chunk - 1n > p.toBlock ? p.toBlock : from + chunk - 1n;
    try {
      const logs = await ctx.publicClient.getLogs({
        address: p.wrappers,
        event: UNWRAP_REQUESTED,
        args: { receiver: p.account },
        fromBlock: from,
        toBlock: to,
      });
      for (const log of logs) {
        out.push({
          requestId: log.args.unwrapRequestId as Hex,
          wrapper: log.address as Address,
          txHash: log.transactionHash,
          block: log.blockNumber,
        });
      }
      from = to + 1n;
    } catch (e) {
      if (isRangeError(e) && chunk > LOG_CHUNK_FLOOR) {
        chunk = chunk / 2n < LOG_CHUNK_FLOOR ? LOG_CHUNK_FLOOR : chunk / 2n;
        continue; // retry same window with smaller chunk
      }
      // Non-range error (RPC without getLogs, rate limit, …) — skip this
      // chunk; results are partial and the watermark must not advance.
      fullyScanned = false;
      from = to + 1n;
    }
  }
  return { logs: out, fullyScanned };
}

/**
 * Pending unwraps = local store ∪ receiver-filtered log scan, every candidate
 * verified against the only on-chain pendingness oracle:
 * unwrapRequester(id) — non-zero while pending, address(0) after finalize.
 *
 * depth "recent" (default): scan the last ~50k blocks — fast (≤5 calls).
 * depth "full": watermarked deep scan from the registry deploy block.
 */
export async function getPendingUnwraps(
  ctx: ReadCtx & { store: UnwrapStore },
  p: { account: Address; wrappers: Address[]; depth?: "recent" | "full" },
): Promise<PendingUnwrap[]> {
  try {
    const head = await ctx.publicClient.getBlockNumber();
    const depth = p.depth ?? "recent";
    const deployFloor = SCAN_FROM_BLOCK[ctx.chainId] ?? 0n;
    const watermark = ctx.store.getWatermark();

    let fromBlock: bigint;
    if (depth === "full") {
      fromBlock = watermark !== undefined && watermark > deployFloor ? watermark + 1n : deployFloor;
    } else {
      const recent = head > RECENT_SCAN_BLOCKS ? head - RECENT_SCAN_BLOCKS : 0n;
      fromBlock = recent > deployFloor ? recent : deployFloor;
    }

    const { logs, fullyScanned } =
      p.wrappers.length > 0 && fromBlock <= head
        ? await scanUnwrapRequested(ctx, {
            account: p.account,
            wrappers: p.wrappers,
            fromBlock,
            toBlock: head,
          })
        : { logs: [], fullyScanned: false };

    // Union: scanned events + every non-finalized local record (covers
    // unwraps this account INITIATED to third-party receivers, which the
    // receiver-indexed scan cannot see).
    const candidates = new Map<string, PendingUnwrap>();
    for (const log of logs) {
      candidates.set(log.requestId.toLowerCase(), {
        requestId: log.requestId,
        wrapper: log.wrapper,
        receiver: p.account,
        requestTxHash: log.txHash,
        requestBlock: log.block,
        source: "scan",
      });
    }
    for (const rec of ctx.store.list()) {
      if (rec.status === "finalized") continue;
      const key = rec.requestId.toLowerCase();
      const existing = candidates.get(key);
      candidates.set(key, {
        requestId: rec.requestId,
        wrapper: rec.wrapper,
        receiver: rec.receiver,
        requestTxHash: rec.requestTxHash ?? existing?.requestTxHash,
        requestBlock: rec.requestBlock ? BigInt(rec.requestBlock) : existing?.requestBlock,
        source: existing ? "both" : "local",
      });
    }

    if (candidates.size === 0) {
      if (depth === "full" && fullyScanned) ctx.store.setWatermark(head);
      return [];
    }

    // Verify each candidate's pendingness on-chain in one multicall.
    const list = [...candidates.values()];
    const results = await ctx.publicClient.multicall({
      allowFailure: true,
      contracts: list.map((c) => ({
        address: c.wrapper,
        abi: erc7984WrapperAbi,
        functionName: "unwrapRequester" as const,
        args: [c.requestId] as const,
      })),
    });

    const pending: PendingUnwrap[] = [];
    for (const [i, c] of list.entries()) {
      const r = results[i];
      const requester = r?.status === "success" ? (r.result as Address) : undefined;
      if (requester && requester !== ZERO_ADDRESS) {
        pending.push(c);
      } else if (requester === ZERO_ADDRESS) {
        // Finalized (possibly elsewhere) — reflect it in the store.
        if (ctx.store.get(c.requestId)) ctx.store.patch(c.requestId, { status: "finalized" });
      }
    }

    if (depth === "full" && fullyScanned) ctx.store.setWatermark(head);
    return pending.sort((a, b) => Number((b.requestBlock ?? 0n) - (a.requestBlock ?? 0n)));
  } catch (e) {
    throw toRegistryError(e);
  }
}
