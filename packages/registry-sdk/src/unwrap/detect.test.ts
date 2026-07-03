import { describe, it, expect, vi } from "vitest";
import { CHAINS } from "@cipher/addresses";
import { RECENT_SCAN_BLOCKS, SCAN_FROM_BLOCK, ZERO_ADDRESS } from "../constants.ts";
import type { Address, Hex, KVStorage, MinimalPublicClient } from "../types.ts";
import { getPendingUnwraps, scanUnwrapRequested } from "./detect.ts";
import { createUnwrapStore, type UnwrapRecord } from "./store.ts";

const CHAIN_ID = CHAINS.sepolia; // 11155111
const DEPLOY_FLOOR = SCAN_FROM_BLOCK[CHAIN_ID]; // 10_162_129n

const ACCOUNT = "0x1111111111111111111111111111111111111111" as Address;
const THIRD_PARTY = "0x2222222222222222222222222222222222222222" as Address;
const INITIATOR = "0x3333333333333333333333333333333333333333" as Address;
const WRAPPER_A = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639" as Address;
const WRAPPER_B = "0x4E7B06D78965594eB5EF5414c357ca21E1554491" as Address;
const REQUESTER = "0x9999999999999999999999999999999999999999" as Address;

const handle = (n: number): Hex => `0x${n.toString(16).padStart(64, "0")}` as Hex;

function makePc() {
  return {
    readContract: vi.fn(),
    multicall: vi.fn(),
    getLogs: vi.fn(),
    getBlockNumber: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
    getChainId: vi.fn(),
  };
}

const asClient = (pc: ReturnType<typeof makePc>) => pc as unknown as MinimalPublicClient;

function makeKV(): KVStorage {
  const backing = new Map<string, string>();
  return {
    get: (k) => backing.get(k) ?? null,
    set: (k, v) => void backing.set(k, v),
    remove: (k) => void backing.delete(k),
  };
}

/** viem-shaped UnwrapRequested log as detect.ts consumes it. */
function scanLog(requestId: Hex, wrapper: Address, block: bigint, txHash: Hex = handle(0x777)) {
  return {
    args: { receiver: ACCOUNT, unwrapRequestId: requestId, amount: handle(0x99) },
    address: wrapper,
    transactionHash: txHash,
    blockNumber: block,
  };
}

function localRecord(overrides: Partial<UnwrapRecord> & { requestId: Hex }): UnwrapRecord {
  return {
    wrapper: WRAPPER_A,
    receiver: ACCOUNT,
    initiator: INITIATOR,
    createdAt: 1_000,
    status: "requested",
    ...overrides,
  };
}

const windows = (pc: ReturnType<typeof makePc>) =>
  pc.getLogs.mock.calls.map(([p]) => [p.fromBlock as bigint, p.toBlock as bigint] as const);

describe("scanUnwrapRequested", () => {
  it("splits a 25k-block range into contiguous 10k/10k/5k windows", async () => {
    const pc = makePc();
    pc.getLogs.mockResolvedValue([]);
    const res = await scanUnwrapRequested(
      { chainId: CHAIN_ID, publicClient: asClient(pc) },
      { account: ACCOUNT, wrappers: [WRAPPER_A], fromBlock: 1_000n, toBlock: 25_999n },
    );

    expect(windows(pc)).toEqual([
      [1_000n, 10_999n],
      [11_000n, 20_999n],
      [21_000n, 25_999n],
    ]);
    // filtered by wrappers + receiver-indexed arg
    expect(pc.getLogs.mock.calls[0][0]).toMatchObject({
      address: [WRAPPER_A],
      args: { receiver: ACCOUNT },
    });
    expect(res).toEqual({ logs: [], fullyScanned: true });
  });

  it("halves the chunk on a range error and retries the SAME window until full coverage", async () => {
    const pc = makePc();
    pc.getLogs
      .mockRejectedValueOnce(new Error("ranges over 10000 blocks are not supported"))
      .mockResolvedValue([]);

    const res = await scanUnwrapRequested(
      { chainId: CHAIN_ID, publicClient: asClient(pc) },
      { account: ACCOUNT, wrappers: [WRAPPER_A], fromBlock: 1_000n, toBlock: 15_999n },
    );

    expect(windows(pc)).toEqual([
      [1_000n, 10_999n], // rejected — 10k too wide
      [1_000n, 5_999n], // retried from the SAME fromBlock at 5k
      [6_000n, 10_999n],
      [11_000n, 15_999n],
    ]);
    expect(res.fullyScanned).toBe(true);

    // contiguous full coverage of [1000, 15999] by the successful calls
    const ok = windows(pc).slice(1);
    expect(ok[0][0]).toBe(1_000n);
    expect(ok[ok.length - 1][1]).toBe(15_999n);
    for (let i = 1; i < ok.length; i++) expect(ok[i][0]).toBe(ok[i - 1][1] + 1n);
  });

  it("skips the chunk on a non-range error, marks fullyScanned=false, still scans the rest", async () => {
    const pc = makePc();
    const log = scanLog(handle(0xa1), WRAPPER_A, 15_000n, handle(0xbeef));
    pc.getLogs.mockRejectedValueOnce(new Error("method not found")).mockResolvedValueOnce([log]);

    const res = await scanUnwrapRequested(
      { chainId: CHAIN_ID, publicClient: asClient(pc) },
      { account: ACCOUNT, wrappers: [WRAPPER_A, WRAPPER_B], fromBlock: 0n, toBlock: 19_999n },
    );

    expect(windows(pc)).toEqual([
      [0n, 9_999n], // skipped, not retried
      [10_000n, 19_999n],
    ]);
    expect(res.fullyScanned).toBe(false);
    expect(res.logs).toEqual([
      { requestId: handle(0xa1), wrapper: WRAPPER_A, txHash: handle(0xbeef), block: 15_000n },
    ]);
  });

  it("never shrinks the chunk below the 2000-block floor; persistent range errors skip at floor size", async () => {
    const pc = makePc();
    pc.getLogs.mockRejectedValue(new Error("query exceeds max block range 10000"));

    const res = await scanUnwrapRequested(
      { chainId: CHAIN_ID, publicClient: asClient(pc) },
      { account: ACCOUNT, wrappers: [WRAPPER_A], fromBlock: 0n, toBlock: 9_999n },
    );

    expect(res).toEqual({ logs: [], fullyScanned: false });
    const sizes = windows(pc).map(([f, t]) => t - f + 1n);
    // 10000 -> 5000 -> 2500 -> clamped 2000, then floor-sized skips to the end
    expect(sizes.slice(0, 4)).toEqual([10_000n, 5_000n, 2_500n, 2_000n]);
    for (const s of sizes) expect(s >= 2_000n || s === sizes[sizes.length - 1]).toBe(true);
    expect(windows(pc)[windows(pc).length - 1][1]).toBe(9_999n);
  });
});

describe("getPendingUnwraps", () => {
  function setup(head: bigint) {
    const pc = makePc();
    pc.getBlockNumber.mockResolvedValue(head);
    pc.getLogs.mockResolvedValue([]);
    const store = createUnwrapStore(makeKV(), CHAIN_ID, ACCOUNT);
    const ctx = { chainId: CHAIN_ID, publicClient: asClient(pc), store };
    return { pc, store, ctx };
  }

  it("unions a store-only third-party record with a scan-only log; both verified pending", async () => {
    const head = DEPLOY_FLOOR + 871n; // recent window clamps to floor -> single getLogs call
    const { pc, store, ctx } = setup(head);

    const localId = handle(0x11);
    const scanId = handle(0x22);
    store.upsert(localRecord({ requestId: localId, wrapper: WRAPPER_A, receiver: THIRD_PARTY }));
    pc.getLogs.mockResolvedValueOnce([scanLog(scanId, WRAPPER_B, DEPLOY_FLOOR + 500n)]);
    pc.multicall.mockResolvedValue([
      { status: "success", result: REQUESTER },
      { status: "success", result: REQUESTER },
    ]);

    const pending = await getPendingUnwraps(ctx, { account: ACCOUNT, wrappers: [WRAPPER_A, WRAPPER_B] });

    expect(pending).toHaveLength(2);
    // sorted by requestBlock desc: scan candidate carries a block, local has none (0n)
    expect(pending[0]).toMatchObject({
      requestId: scanId,
      wrapper: WRAPPER_B,
      receiver: ACCOUNT,
      requestBlock: DEPLOY_FLOOR + 500n,
      source: "scan",
    });
    expect(pending[1]).toMatchObject({
      requestId: localId,
      wrapper: WRAPPER_A,
      receiver: THIRD_PARTY,
      source: "local",
    });

    // one multicall verifying every candidate via unwrapRequester(id)
    expect(pc.multicall).toHaveBeenCalledTimes(1);
    const { contracts, allowFailure } = pc.multicall.mock.calls[0][0];
    expect(allowFailure).toBe(true);
    expect(contracts).toHaveLength(2);
    expect(contracts.map((c: { address: Address; functionName: string; args: readonly Hex[] }) => ({
      address: c.address,
      functionName: c.functionName,
      args: c.args,
    }))).toEqual([
      { address: WRAPPER_B, functionName: "unwrapRequester", args: [scanId] },
      { address: WRAPPER_A, functionName: "unwrapRequester", args: [localId] },
    ]);
  });

  it("a store record ALSO found by scan collapses into ONE entry with source 'both'", async () => {
    const head = DEPLOY_FLOOR + 871n;
    const { pc, store, ctx } = setup(head);

    const id = handle(0x33);
    store.upsert(localRecord({ requestId: id, wrapper: WRAPPER_A, requestTxHash: handle(0xf00d) }));
    pc.getLogs.mockResolvedValueOnce([scanLog(id, WRAPPER_A, DEPLOY_FLOOR + 400n)]);
    pc.multicall.mockResolvedValue([{ status: "success", result: REQUESTER }]);

    const pending = await getPendingUnwraps(ctx, { account: ACCOUNT, wrappers: [WRAPPER_A] });

    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      requestId: id,
      source: "both",
      requestTxHash: handle(0xf00d), // store's tx hash wins
      requestBlock: DEPLOY_FLOOR + 400n, // block backfilled from the scan
    });
    expect(pc.multicall.mock.calls[0][0].contracts).toHaveLength(1);
  });

  it("drops candidates whose unwrapRequester is address(0) and patches store records to finalized", async () => {
    const head = DEPLOY_FLOOR + 871n;
    const { pc, store, ctx } = setup(head);

    const localId = handle(0x44);
    const scanOnlyId = handle(0x55);
    store.upsert(localRecord({ requestId: localId, wrapper: WRAPPER_A }));
    pc.getLogs.mockResolvedValueOnce([scanLog(scanOnlyId, WRAPPER_B, DEPLOY_FLOOR + 10n)]);
    pc.multicall.mockResolvedValue([
      { status: "success", result: ZERO_ADDRESS }, // scan-only: dropped, nothing to patch
      { status: "success", result: ZERO_ADDRESS }, // local: dropped + store patched
    ]);

    const pending = await getPendingUnwraps(ctx, { account: ACCOUNT, wrappers: [WRAPPER_A, WRAPPER_B] });

    expect(pending).toEqual([]);
    expect(store.get(localId)?.status).toBe("finalized");
    expect(store.get(scanOnlyId)).toBeUndefined();
  });

  it("depth 'recent': fromBlock = head - RECENT_SCAN_BLOCKS and the watermark never advances", async () => {
    const head = DEPLOY_FLOOR + 100_000n;
    const { pc, store, ctx } = setup(head);

    await getPendingUnwraps(ctx, { account: ACCOUNT, wrappers: [WRAPPER_A] });

    const w = windows(pc);
    expect(w[0][0]).toBe(head - RECENT_SCAN_BLOCKS);
    expect(w[w.length - 1][1]).toBe(head);
    expect(store.getWatermark()).toBeUndefined();
  });

  it("depth 'recent' clamps fromBlock to SCAN_FROM_BLOCK near the deploy block", async () => {
    const head = DEPLOY_FLOOR + 7_871n; // head - 50k would predate the registry
    const { pc, ctx } = setup(head);

    await getPendingUnwraps(ctx, { account: ACCOUNT, wrappers: [WRAPPER_A] });

    expect(windows(pc)[0][0]).toBe(DEPLOY_FLOOR);
  });

  it("depth 'full' first run scans from SCAN_FROM_BLOCK and advances the watermark to head", async () => {
    const head = DEPLOY_FLOOR + 999n;
    const { pc, store, ctx } = setup(head);

    await getPendingUnwraps(ctx, { account: ACCOUNT, wrappers: [WRAPPER_A], depth: "full" });

    expect(windows(pc)).toEqual([[DEPLOY_FLOOR, head]]);
    expect(store.getWatermark()).toBe(head);
  });

  it("depth 'full' with a watermark w resumes from w+1", async () => {
    const head = DEPLOY_FLOOR + 42_871n;
    const { pc, store, ctx } = setup(head);
    const w = DEPLOY_FLOOR + 37_871n;
    store.setWatermark(w);

    await getPendingUnwraps(ctx, { account: ACCOUNT, wrappers: [WRAPPER_A], depth: "full" });

    expect(windows(pc)[0][0]).toBe(w + 1n);
    expect(store.getWatermark()).toBe(head);
  });

  it("depth 'full' does NOT advance the watermark when the scan is partial", async () => {
    const head = DEPLOY_FLOOR + 999n;
    const { pc, store, ctx } = setup(head);
    pc.getLogs.mockRejectedValue(new Error("method not found")); // non-range: chunk skipped

    await getPendingUnwraps(ctx, { account: ACCOUNT, wrappers: [WRAPPER_A], depth: "full" });

    expect(store.getWatermark()).toBeUndefined();
  });
});
