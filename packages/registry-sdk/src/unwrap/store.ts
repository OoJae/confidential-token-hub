import type { Address, Hex, KVStorage } from "../types.ts";

export type UnwrapStatus = "requested" | "finalizing" | "finalized";

export interface UnwrapRecord {
  requestId: Hex;
  wrapper: Address;
  receiver: Address;
  initiator: Address;
  requestTxHash?: Hex;
  requestBlock?: string; // bigint as string (JSON-safe)
  createdAt: number;
  status: UnwrapStatus;
  finalizeTxHash?: Hex;
  cleartext?: string;
}

interface StoreShape {
  v: 1;
  watermark?: string; // last fully scanned block (bigint as string)
  requests: Record<string, UnwrapRecord>;
}

const FINALIZED_HISTORY_CAP = 20;

export interface UnwrapStore {
  upsert(record: UnwrapRecord): void;
  patch(requestId: Hex, patch: Partial<UnwrapRecord>): void;
  get(requestId: Hex): UnwrapRecord | undefined;
  list(): UnwrapRecord[];
  getWatermark(): bigint | undefined;
  setWatermark(block: bigint): void;
}

const memory = new Map<string, string>();

export function defaultKV(): KVStorage {
  if (typeof window !== "undefined") {
    return {
      get: (k) => {
        try {
          return window.localStorage.getItem(k);
        } catch {
          return null;
        }
      },
      set: (k, v) => {
        try {
          window.localStorage.setItem(k, v);
        } catch {
          /* quota — degrade */
        }
      },
      remove: (k) => {
        try {
          window.localStorage.removeItem(k);
        } catch {
          /* ignore */
        }
      },
    };
  }
  return {
    get: (k) => memory.get(k) ?? null,
    set: (k, v) => void memory.set(k, v),
    remove: (k) => void memory.delete(k),
  };
}

export const unwrapStoreKey = (chainId: number, account: Address) =>
  `cipher.registry.unwraps.v1:${chainId}:${account.toLowerCase()}`;

/**
 * Multi-pending unwrap persistence, keyed by requestId — multiple concurrent
 * pending unwraps per wrapper are native (requestIds are globally unique
 * ciphertext handles). Corrupt state degrades to fresh, never throws.
 */
export function createUnwrapStore(kv: KVStorage, chainId: number, account: Address): UnwrapStore {
  const key = unwrapStoreKey(chainId, account);

  const load = (): StoreShape => {
    const raw = kv.get(key);
    if (!raw) return { v: 1, requests: {} };
    try {
      const parsed = JSON.parse(raw) as StoreShape;
      if (parsed.v !== 1 || typeof parsed.requests !== "object" || parsed.requests === null) {
        throw new Error("bad shape");
      }
      return parsed;
    } catch {
      return { v: 1, requests: {} };
    }
  };

  const save = (s: StoreShape) => {
    // Prune: keep every non-finalized record forever; cap finalized history.
    const finalized = Object.values(s.requests)
      .filter((r) => r.status === "finalized")
      .sort((a, b) => b.createdAt - a.createdAt);
    for (const stale of finalized.slice(FINALIZED_HISTORY_CAP)) {
      delete s.requests[stale.requestId];
    }
    kv.set(key, JSON.stringify(s));
  };

  return {
    upsert(record) {
      const s = load();
      s.requests[record.requestId] = record;
      save(s);
    },
    patch(requestId, patch) {
      const s = load();
      const existing = s.requests[requestId];
      if (!existing) return;
      s.requests[requestId] = { ...existing, ...patch };
      save(s);
    },
    get(requestId) {
      return load().requests[requestId];
    },
    list() {
      return Object.values(load().requests).sort((a, b) => b.createdAt - a.createdAt);
    },
    getWatermark() {
      const w = load().watermark;
      return w === undefined ? undefined : BigInt(w);
    },
    setWatermark(block) {
      const s = load();
      s.watermark = block.toString();
      save(s);
    },
  };
}
