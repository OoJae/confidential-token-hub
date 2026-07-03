import { describe, it, expect } from "vitest";
import { CHAINS } from "@cipher/addresses";
import type { Address, Hex, KVStorage } from "../types.ts";
import { createUnwrapStore, defaultKV, unwrapStoreKey, type UnwrapRecord } from "./store.ts";

const CHAIN_ID = CHAINS.sepolia; // 11155111

const ACCOUNT = "0xAbCdEF1234567890abcdef1234567890ABCDEF12" as Address;
const WRAPPER = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639" as Address;
const RECEIVER = "0x2222222222222222222222222222222222222222" as Address;
const INITIATOR = "0x3333333333333333333333333333333333333333" as Address;

const handle = (n: number): Hex => `0x${n.toString(16).padStart(64, "0")}` as Hex;

function makeKV(): KVStorage & { backing: Map<string, string> } {
  const backing = new Map<string, string>();
  return {
    backing,
    get: (k) => backing.get(k) ?? null,
    set: (k, v) => void backing.set(k, v),
    remove: (k) => void backing.delete(k),
  };
}

function record(overrides: Partial<UnwrapRecord> & { requestId: Hex }): UnwrapRecord {
  return {
    wrapper: WRAPPER,
    receiver: RECEIVER,
    initiator: INITIATOR,
    createdAt: 1_000,
    status: "requested",
    ...overrides,
  };
}

describe("unwrapStoreKey", () => {
  it("formats as cipher.registry.unwraps.v1:{chainId}:{lowercased account}", () => {
    expect(unwrapStoreKey(CHAIN_ID, ACCOUNT)).toBe(
      `cipher.registry.unwraps.v1:11155111:${ACCOUNT.toLowerCase()}`,
    );
  });
});

describe("defaultKV", () => {
  it("returns a memory-backed KV in node (no window) with get/set/remove round-trip", () => {
    const kv = defaultKV();
    expect(kv.get("cipher.test.key")).toBeNull();
    kv.set("cipher.test.key", "value-1");
    expect(kv.get("cipher.test.key")).toBe("value-1");
    kv.remove("cipher.test.key");
    expect(kv.get("cipher.test.key")).toBeNull();
  });
});

describe("createUnwrapStore", () => {
  it("persists under the versioned per-chain per-account key", () => {
    const kv = makeKV();
    const store = createUnwrapStore(kv, CHAIN_ID, ACCOUNT);
    store.upsert(record({ requestId: handle(1) }));
    expect([...kv.backing.keys()]).toEqual([unwrapStoreKey(CHAIN_ID, ACCOUNT)]);
  });

  it("anti-official-SDK assertion: two records with the SAME wrapper but different requestIds coexist", () => {
    const kv = makeKV();
    const store = createUnwrapStore(kv, CHAIN_ID, ACCOUNT);
    const a = record({ requestId: handle(0xa1), wrapper: WRAPPER, createdAt: 10 });
    const b = record({ requestId: handle(0xb2), wrapper: WRAPPER, createdAt: 20 });
    store.upsert(a);
    store.upsert(b);

    expect(store.get(a.requestId)).toEqual(a);
    expect(store.get(b.requestId)).toEqual(b);
    const listed = store.list();
    expect(listed).toHaveLength(2);
    expect(listed.filter((r) => r.wrapper === WRAPPER)).toHaveLength(2);
  });

  it("get/list round-trips records", () => {
    const kv = makeKV();
    const store = createUnwrapStore(kv, CHAIN_ID, ACCOUNT);
    const rec = record({
      requestId: handle(7),
      requestTxHash: handle(0xdead),
      requestBlock: "10200000",
      cleartext: "123456",
    });
    store.upsert(rec);
    expect(store.get(rec.requestId)).toEqual(rec);
    expect(store.list()).toEqual([rec]);
    expect(store.get(handle(0xffff))).toBeUndefined();
  });

  it("patch() merges into the existing record and ignores unknown requestIds", () => {
    const kv = makeKV();
    const store = createUnwrapStore(kv, CHAIN_ID, ACCOUNT);
    const rec = record({ requestId: handle(9), status: "requested" });
    store.upsert(rec);

    store.patch(rec.requestId, { status: "finalizing", finalizeTxHash: handle(0xbeef) });
    expect(store.get(rec.requestId)).toEqual({
      ...rec,
      status: "finalizing",
      finalizeTxHash: handle(0xbeef),
    });

    // patching a missing id is a no-op, not a create
    store.patch(handle(0x404), { status: "finalized" });
    expect(store.get(handle(0x404))).toBeUndefined();
    expect(store.list()).toHaveLength(1);
  });

  it("list() sorts by createdAt descending", () => {
    const kv = makeKV();
    const store = createUnwrapStore(kv, CHAIN_ID, ACCOUNT);
    store.upsert(record({ requestId: handle(1), createdAt: 100 }));
    store.upsert(record({ requestId: handle(2), createdAt: 300 }));
    store.upsert(record({ requestId: handle(3), createdAt: 200 }));
    expect(store.list().map((r) => r.createdAt)).toEqual([300, 200, 100]);
  });

  it("watermark set/get round-trips as bigint", () => {
    const kv = makeKV();
    const store = createUnwrapStore(kv, CHAIN_ID, ACCOUNT);
    expect(store.getWatermark()).toBeUndefined();
    store.setWatermark(10_162_129n);
    expect(store.getWatermark()).toBe(10_162_129n);
    store.setWatermark(10_262_129n);
    expect(store.getWatermark()).toBe(10_262_129n);
  });

  it("prunes finalized history to 20 (oldest dropped) while keeping every requested record", () => {
    const kv = makeKV();
    const store = createUnwrapStore(kv, CHAIN_ID, ACCOUNT);

    // 25 finalized records with distinct createdAt 1..25
    for (let i = 1; i <= 25; i++) {
      store.upsert(record({ requestId: handle(i), createdAt: i, status: "finalized" }));
    }
    // 3 requested records
    for (let i = 100; i < 103; i++) {
      store.upsert(record({ requestId: handle(i), createdAt: i, status: "requested" }));
    }
    // one more upsert triggers another prune pass
    store.upsert(record({ requestId: handle(26), createdAt: 26, status: "finalized" }));

    const all = store.list();
    const finalized = all.filter((r) => r.status === "finalized");
    const requested = all.filter((r) => r.status === "requested");

    expect(finalized.length).toBeLessThanOrEqual(20);
    expect(finalized).toHaveLength(20);
    // newest finalized survive; the oldest were dropped
    expect(Math.min(...finalized.map((r) => r.createdAt))).toBe(7);
    expect(Math.max(...finalized.map((r) => r.createdAt))).toBe(26);
    // ALL requested records remain, regardless of age
    expect(requested).toHaveLength(3);
    expect(requested.map((r) => r.requestId).sort()).toEqual(
      [handle(100), handle(101), handle(102)].sort(),
    );
  });

  it("corrupt JSON in KV degrades to fresh state without throwing", () => {
    const kv = makeKV();
    const key = unwrapStoreKey(CHAIN_ID, ACCOUNT);
    kv.set(key, "{not json!!!");
    const store = createUnwrapStore(kv, CHAIN_ID, ACCOUNT);

    expect(() => store.list()).not.toThrow();
    expect(store.list()).toEqual([]);
    expect(store.get(handle(1))).toBeUndefined();
    expect(store.getWatermark()).toBeUndefined();

    // writes recover the store
    const rec = record({ requestId: handle(1) });
    store.upsert(rec);
    expect(store.get(rec.requestId)).toEqual(rec);
  });

  it("wrong-shape JSON (bad version) also degrades to fresh state", () => {
    const kv = makeKV();
    kv.set(unwrapStoreKey(CHAIN_ID, ACCOUNT), JSON.stringify({ v: 2, requests: {} }));
    const store = createUnwrapStore(kv, CHAIN_ID, ACCOUNT);
    expect(store.list()).toEqual([]);
  });
});
