/**
 * Storage adapter for decryption-session metadata. Default tier is
 * sessionStorage: survives a refresh within the tab (rule 5 — no re-prompt
 * mid-demo) but dies with the tab and never persists a read-everything
 * transport keypair indefinitely (localStorage is opt-in only).
 */
export type StorageTier = "memory" | "session" | "local";

export interface KVStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

const memoryStore = new Map<string, string>();

export function createStorage(tier: StorageTier): KVStorage {
  if (tier === "memory" || typeof window === "undefined") {
    return {
      get: (k) => memoryStore.get(k) ?? null,
      set: (k, v) => void memoryStore.set(k, v),
      remove: (k) => void memoryStore.delete(k),
    };
  }
  const backing = tier === "local" ? window.localStorage : window.sessionStorage;
  return {
    get: (k) => {
      try {
        return backing.getItem(k);
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        backing.setItem(k, v);
      } catch {
        /* quota/private-mode — degrade to no persistence */
      }
    },
    remove: (k) => {
      try {
        backing.removeItem(k);
      } catch {
        /* ignore */
      }
    },
  };
}

export const sessionKey = (chainId: number, userAddress: string) =>
  `cipher.fhe.session.v1:${chainId}:${userAddress.toLowerCase()}`;

/**
 * The async storage shape @zama-fhe/sdk accepts as `storage`/`permitStorage`
 * (GenericStorage). We hand the SDK a tab-scoped sessionStorage adapter by
 * default so the ML-KEM transport keypair + permits (stored PLAINTEXT by the
 * SDK) never persist beyond the tab. `local`/IndexedDB is opt-in.
 */
export interface GenericStorageLike {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

const PREFIX = "cipher.fhe.credentials.v1:";

export function toGenericStorage(tier: StorageTier): GenericStorageLike {
  const kv = createStorage(tier);
  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = kv.get(PREFIX + key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    async set<T>(key: string, value: T): Promise<void> {
      kv.set(PREFIX + key, JSON.stringify(value));
    },
    async delete(key: string): Promise<void> {
      kv.remove(PREFIX + key);
    },
  };
}
