import { describe, it, expect, vi, afterEach } from "vitest";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import { CHAINS } from "@cipher/addresses";
import { erc7984WrapperAbi } from "@cipher/addresses/abis";
import { unwrapStart, unwrapFinalize } from "./machine.ts";
import { createUnwrapStore, type UnwrapStore } from "./store.ts";
import type {
  Address,
  FheAdapter,
  Hex,
  KVStorage,
  MinimalPublicClient,
  MinimalWalletClient,
} from "../types.ts";

// ── fixtures ────────────────────────────────────────────────────────────────

const CHAIN_ID = CHAINS.sepolia; // 11155111
const WRAPPER = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639" as Address;
// Digits-only address: checksums to itself, so decoded event args compare equal.
const INITIATOR = "0x1111111111111111111111111111111111111111" as Address;
const REQUEST_ID = `0x${"ab".repeat(32)}` as Hex; // bytes32 handle (lowercase)
const AMOUNT_HANDLE = `0x${"cd".repeat(32)}` as Hex;
const ENC_HANDLE = `0x${"ee".repeat(32)}` as Hex;
const INPUT_PROOF = `0x${"ff".repeat(48)}` as Hex;
const DECRYPTION_PROOF = `0x${"1f".repeat(64)}` as Hex;
const START_TX = `0x${"aa".repeat(32)}` as Hex;
const FINALIZE_TX = `0x${"bb".repeat(32)}` as Hex;
const BLOCK_HASH = `0x${"dc".repeat(32)}` as Hex;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

// ── real encoded logs (parseEventLogs needs genuine topics/data) ────────────

function unwrapRequestedLog(p?: { receiver?: Address; requestId?: Hex; blockNumber?: bigint }) {
  const topics = encodeEventTopics({
    abi: erc7984WrapperAbi,
    eventName: "UnwrapRequested",
    args: { receiver: p?.receiver ?? INITIATOR, unwrapRequestId: p?.requestId ?? REQUEST_ID },
  });
  return {
    address: WRAPPER,
    topics,
    data: encodeAbiParameters([{ type: "bytes32" }], [AMOUNT_HANDLE]),
    blockNumber: p?.blockNumber ?? 1n,
    logIndex: 0,
    transactionHash: START_TX,
    transactionIndex: 0,
    blockHash: BLOCK_HASH,
    removed: false,
  };
}

function unwrapFinalizedLog(cleartext: bigint) {
  const topics = encodeEventTopics({
    abi: erc7984WrapperAbi,
    eventName: "UnwrapFinalized",
    args: { receiver: INITIATOR, unwrapRequestId: REQUEST_ID },
  });
  return {
    address: WRAPPER,
    topics,
    data: encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint64" }],
      [AMOUNT_HANDLE, cleartext],
    ),
    blockNumber: 9n,
    logIndex: 0,
    transactionHash: FINALIZE_TX,
    transactionIndex: 0,
    blockHash: BLOCK_HASH,
    removed: false,
  };
}

// ── stubs ───────────────────────────────────────────────────────────────────

function makeKV(): KVStorage {
  const m = new Map<string, string>();
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
  };
}

function makePublicClient() {
  return {
    readContract: vi.fn(),
    multicall: vi.fn(),
    getLogs: vi.fn(),
    getBlockNumber: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
    getChainId: vi.fn(),
  };
}

function makeWalletClient() {
  return {
    writeContract: vi.fn(),
    account: { address: INITIATOR },
    chain: undefined,
  };
}

function makeFhe() {
  return {
    encryptU64: vi.fn(),
    userDecrypt: vi.fn(),
    publicDecrypt: vi.fn(),
  };
}

function makeCtx(opts?: { kv?: KVStorage; store?: UnwrapStore }) {
  const pc = makePublicClient();
  const wc = makeWalletClient();
  const fhe = makeFhe();
  const store = opts?.store ?? createUnwrapStore(opts?.kv ?? makeKV(), CHAIN_ID, INITIATOR);
  const ctx = {
    chainId: CHAIN_ID,
    publicClient: pc as unknown as MinimalPublicClient,
    walletClient: wc as unknown as MinimalWalletClient,
    fhe: fhe as unknown as FheAdapter,
    store,
  };
  return { ctx, pc, wc, fhe, store };
}

const seedRequested = (store: UnwrapStore) =>
  store.upsert({
    requestId: REQUEST_ID,
    wrapper: WRAPPER,
    receiver: INITIATOR,
    initiator: INITIATOR,
    requestTxHash: START_TX,
    requestBlock: "7",
    createdAt: Date.now(),
    status: "requested",
  });

/** Wire the happy start path: encrypt → write → receipt with a real event log. */
function wireHappyStart(pc: ReturnType<typeof makePublicClient>, wc: ReturnType<typeof makeWalletClient>, fhe: ReturnType<typeof makeFhe>) {
  fhe.encryptU64.mockResolvedValue({ handle: ENC_HANDLE, inputProof: INPUT_PROOF });
  wc.writeContract.mockResolvedValue(START_TX);
  pc.waitForTransactionReceipt.mockResolvedValue({
    status: "success",
    logs: [unwrapRequestedLog({ blockNumber: 7n })],
    blockNumber: 7n,
  });
}

/** Wire the happy finalize path: requester → decrypt → write → success receipt. */
function wireHappyFinalize(pc: ReturnType<typeof makePublicClient>, wc: ReturnType<typeof makeWalletClient>, fhe: ReturnType<typeof makeFhe>, cleartext = 42n) {
  pc.readContract.mockResolvedValue(INITIATOR);
  fhe.publicDecrypt.mockResolvedValue({
    clearValues: { [REQUEST_ID]: cleartext },
    decryptionProof: DECRYPTION_PROOF,
  });
  wc.writeContract.mockResolvedValue(FINALIZE_TX);
  pc.waitForTransactionReceipt.mockResolvedValue({
    status: "success",
    logs: [unwrapFinalizedLog(cleartext)],
    blockNumber: 9n,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

// ── unwrapStart ─────────────────────────────────────────────────────────────

describe("unwrapStart", () => {
  it("encrypts, submits unwrap, parses UnwrapRequested, persists the record before returning", async () => {
    const { ctx, pc, wc, fhe, store } = makeCtx();
    wireHappyStart(pc, wc, fhe);

    const res = await unwrapStart(ctx, { wrapper: WRAPPER, amount: 1_000_000n });

    expect(fhe.encryptU64).toHaveBeenCalledTimes(1);
    expect(fhe.encryptU64).toHaveBeenCalledWith({
      contractAddress: WRAPPER,
      userAddress: INITIATOR,
      value: 1_000_000n,
    });
    expect(wc.writeContract).toHaveBeenCalledTimes(1);
    expect(wc.writeContract.mock.calls[0][0]).toMatchObject({
      address: WRAPPER,
      functionName: "unwrap",
      args: [INITIATOR, INITIATOR, ENC_HANDLE, INPUT_PROOF],
    });

    expect(res.requestId).toBe(REQUEST_ID);
    expect(res.receiver).toBe(INITIATOR);
    expect(res.requestBlock).toBe(7n);
    expect(res.txHash).toBe(START_TX);

    // Rule 2: record persisted (status "requested") before return.
    const record = store.get(REQUEST_ID);
    expect(record).toMatchObject({
      requestId: REQUEST_ID,
      wrapper: WRAPPER,
      receiver: INITIATOR,
      initiator: INITIATOR,
      requestTxHash: START_TX,
      requestBlock: "7",
      status: "requested",
    });
    expect(typeof record?.createdAt).toBe("number");
  });

  it("throws UNKNOWN when the receipt has no UnwrapRequested log", async () => {
    const { ctx, pc, wc, fhe, store } = makeCtx();
    fhe.encryptU64.mockResolvedValue({ handle: ENC_HANDLE, inputProof: INPUT_PROOF });
    wc.writeContract.mockResolvedValue(START_TX);
    pc.waitForTransactionReceipt.mockResolvedValue({ status: "success", logs: [], blockNumber: 7n });

    await expect(unwrapStart(ctx, { wrapper: WRAPPER, amount: 5n })).rejects.toMatchObject({
      name: "RegistryError",
      code: "UNKNOWN",
    });
    expect(store.get(REQUEST_ID)).toBeUndefined();
  });
});

// ── unwrapFinalize ──────────────────────────────────────────────────────────

describe("unwrapFinalize", () => {
  it("public-decrypts the requestId and submits finalizeUnwrap with the proof verbatim", async () => {
    const { ctx, pc, wc, fhe, store } = makeCtx();
    seedRequested(store);
    wireHappyFinalize(pc, wc, fhe, 42n);

    const res = await unwrapFinalize(ctx, { wrapper: WRAPPER, requestId: REQUEST_ID });

    expect(pc.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: WRAPPER, functionName: "unwrapRequester", args: [REQUEST_ID] }),
    );
    expect(fhe.publicDecrypt).toHaveBeenCalledTimes(1);
    expect(fhe.publicDecrypt).toHaveBeenCalledWith([REQUEST_ID]);

    const call = wc.writeContract.mock.calls.find((c) => c[0].functionName === "finalizeUnwrap");
    expect(call).toBeDefined();
    expect(call![0].args).toEqual([REQUEST_ID, 42n, DECRYPTION_PROOF]);

    expect(res.cleartext).toBe(42n);
    expect(res.txHash).toBe(FINALIZE_TX);

    expect(store.get(REQUEST_ID)).toMatchObject({
      status: "finalized",
      finalizeTxHash: FINALIZE_TX,
      cleartext: "42",
    });
  });

  it("resumes after refresh: a second store over the same KV finalizes without encrypting", async () => {
    const kv = makeKV();

    // Session 1: start the unwrap with store A.
    const first = makeCtx({ kv });
    wireHappyStart(first.pc, first.wc, first.fhe);
    const { requestId } = await unwrapStart(first.ctx, { wrapper: WRAPPER, amount: 77n });
    expect(requestId).toBe(REQUEST_ID);

    // Session 2 ("after refresh"): fresh store instance over the same KV.
    const storeB = createUnwrapStore(kv, CHAIN_ID, INITIATOR);
    expect(storeB.get(REQUEST_ID)).toMatchObject({ status: "requested" });

    const second = makeCtx({ kv, store: storeB });
    wireHappyFinalize(second.pc, second.wc, second.fhe, 77n);

    const res = await unwrapFinalize(second.ctx, { wrapper: WRAPPER, requestId: REQUEST_ID });

    expect(res.cleartext).toBe(77n);
    expect(second.fhe.encryptU64).not.toHaveBeenCalled();
    expect(storeB.get(REQUEST_ID)).toMatchObject({ status: "finalized", cleartext: "77" });
  });

  it("retries publicDecrypt on DECRYPTION_PENDING with backoff, then succeeds", async () => {
    vi.useFakeTimers();
    const { ctx, pc, wc, fhe, store } = makeCtx();
    seedRequested(store);
    pc.readContract.mockResolvedValue(INITIATOR);
    const pending = () => ({
      code: "DECRYPTION_PENDING",
      retryable: true,
      message: "decryption pending",
    });
    fhe.publicDecrypt
      .mockRejectedValueOnce(pending())
      .mockRejectedValueOnce(pending())
      .mockResolvedValue({
        clearValues: { [REQUEST_ID]: 42n },
        decryptionProof: DECRYPTION_PROOF,
      });
    wc.writeContract.mockResolvedValue(FINALIZE_TX);
    pc.waitForTransactionReceipt.mockResolvedValue({ status: "success", logs: [], blockNumber: 9n });

    const promise = unwrapFinalize(ctx, {
      wrapper: WRAPPER,
      requestId: REQUEST_ID,
      maxDecryptAttempts: 5,
    });
    await vi.runAllTimersAsync(); // flush the 1500ms / 3000ms backoff sleeps
    const res = await promise;

    expect(fhe.publicDecrypt).toHaveBeenCalledTimes(3);
    expect(res.cleartext).toBe(42n);
    expect(store.get(REQUEST_ID)).toMatchObject({ status: "finalized", cleartext: "42" });
  });

  it("reverts the record to 'requested' when finalizeUnwrap reverts, and a retry succeeds", async () => {
    const { ctx, pc, wc, fhe, store } = makeCtx();
    seedRequested(store);
    pc.readContract.mockResolvedValue(INITIATOR);
    fhe.publicDecrypt.mockResolvedValue({
      clearValues: { [REQUEST_ID]: 42n },
      decryptionProof: DECRYPTION_PROOF,
    });
    wc.writeContract.mockResolvedValue(FINALIZE_TX);
    pc.waitForTransactionReceipt
      .mockResolvedValueOnce({ status: "reverted", logs: [], blockNumber: 9n })
      .mockResolvedValue({ status: "success", logs: [unwrapFinalizedLog(42n)], blockNumber: 10n });

    await expect(
      unwrapFinalize(ctx, { wrapper: WRAPPER, requestId: REQUEST_ID }),
    ).rejects.toMatchObject({ name: "RegistryError", code: "UNKNOWN" });

    // Record stays detectable/retryable — not stuck in "finalizing", not corrupted.
    const afterFailure = store.get(REQUEST_ID);
    expect(afterFailure).toMatchObject({ status: "requested", requestTxHash: START_TX });
    expect(afterFailure?.finalizeTxHash).toBeUndefined();
    expect(afterFailure?.cleartext).toBeUndefined();

    const res = await unwrapFinalize(ctx, { wrapper: WRAPPER, requestId: REQUEST_ID });
    expect(res.cleartext).toBe(42n);
    expect(store.get(REQUEST_ID)).toMatchObject({
      status: "finalized",
      finalizeTxHash: FINALIZE_TX,
      cleartext: "42",
    });
  });

  it("throws NO_PENDING_REQUEST when unwrapRequester is address(0) and flips the record to finalized", async () => {
    const { ctx, pc, fhe, store } = makeCtx();
    seedRequested(store);
    pc.readContract.mockResolvedValue(ZERO_ADDRESS);

    await expect(
      unwrapFinalize(ctx, { wrapper: WRAPPER, requestId: REQUEST_ID }),
    ).rejects.toMatchObject({ name: "RegistryError", code: "NO_PENDING_REQUEST" });

    expect(fhe.publicDecrypt).not.toHaveBeenCalled();
    expect(store.get(REQUEST_ID)).toMatchObject({ status: "finalized" });
  });
});
