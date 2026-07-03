import { describe, it, expect, vi } from "vitest";
import { CHAINS, REGISTRY } from "@cipher/addresses";
import {
  listPairs,
  getWrapperForToken,
  getTokenForWrapper,
  isWrapperValid,
} from "./registry.ts";
import { ZERO_ADDRESS } from "./constants.ts";
import type { Address, MinimalPublicClient, ReadCtx } from "./types.ts";

const LENGTH_FN = "getTokenConfidentialTokenPairsLength";
const SLICE_FN = "getTokenConfidentialTokenPairsSlice";

/** Deterministic realistic 40-hex-char addresses. */
const tokenAddr = (i: number): Address =>
  `0x9b5Cd13b8eFbB58Dc25A05CF411D80560000${i.toString(16).padStart(4, "0")}` as Address;
const wrapperAddr = (i: number): Address =>
  `0x7c5BF43B851c1dff1a4feE8dB225b87f0000${i.toString(16).padStart(4, "0")}` as Address;

/** Raw registry structs as the contract returns them (index 4 is revoked). */
const RAW = Array.from({ length: 9 }, (_, i) => ({
  tokenAddress: tokenAddr(i),
  confidentialTokenAddress: wrapperAddr(i),
  isValid: i !== 4,
}));

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

function makeCtx(pc: ReturnType<typeof makePc>, registry?: Address): ReadCtx {
  return {
    chainId: CHAINS.sepolia,
    publicClient: pc as unknown as MinimalPublicClient,
    ...(registry ? { registry } : {}),
  };
}

function sliceCalls(pc: ReturnType<typeof makePc>): [bigint, bigint][] {
  return pc.readContract.mock.calls
    .filter(([p]: any[]) => p.functionName === SLICE_FN)
    .map(([p]: any[]) => p.args as [bigint, bigint]);
}

describe("listPairs", () => {
  it("length 9 with default pageSize 25 issues one slice (0,9) and returns 9 pairs with indices 0..8", async () => {
    const pc = makePc();
    pc.readContract.mockImplementation(async ({ functionName, args }: any) => {
      if (functionName === LENGTH_FN) return 9n;
      if (functionName === SLICE_FN) {
        const [from, to] = args as [bigint, bigint];
        return RAW.slice(Number(from), Number(to));
      }
      throw new Error(`unexpected functionName ${functionName}`);
    });

    const pairs = await listPairs(makeCtx(pc));

    expect(sliceCalls(pc)).toEqual([[0n, 9n]]);
    expect(pairs).toHaveLength(9);
    expect(pairs.map((p) => p.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(pairs[0]).toEqual({
      token: tokenAddr(0),
      wrapper: wrapperAddr(0),
      isValid: true,
      index: 0,
    });
    expect(pairs[8]).toEqual({
      token: tokenAddr(8),
      wrapper: wrapperAddr(8),
      isValid: true,
      index: 8,
    });
  });

  it("length 9 with pageSize 5 issues slices (0,5) and (5,9)", async () => {
    const pc = makePc();
    pc.readContract.mockImplementation(async ({ functionName, args }: any) => {
      if (functionName === LENGTH_FN) return 9n;
      const [from, to] = args as [bigint, bigint];
      return RAW.slice(Number(from), Number(to));
    });

    const pairs = await listPairs(makeCtx(pc), { pageSize: 5 });

    expect(sliceCalls(pc)).toEqual([
      [0n, 5n],
      [5n, 9n],
    ]);
    expect(pairs).toHaveLength(9);
    expect(pairs.map((p) => p.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("shrink mid-pagination: failing slice triggers one length re-read and a clamped retry, no throw, no duplicates", async () => {
    const pc = makePc();
    let lengthReads = 0;
    // Registry shrank from 9 to 7 after the first page was served.
    pc.readContract.mockImplementation(async ({ functionName, args }: any) => {
      if (functionName === LENGTH_FN) {
        lengthReads++;
        return lengthReads === 1 ? 9n : 7n;
      }
      const [from, to] = args as [bigint, bigint];
      if (to > 7n) throw new Error("slice out of bounds");
      return RAW.slice(Number(from), Number(to));
    });

    const pairs = await listPairs(makeCtx(pc), { pageSize: 5 });

    expect(lengthReads).toBe(2);
    expect(sliceCalls(pc)).toEqual([
      [0n, 5n],
      [5n, 9n], // rejected
      [5n, 7n], // clamped retry
    ]);
    expect(pairs).toHaveLength(7);
    expect(pairs.map((p) => p.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // no duplicates
    expect(new Set(pairs.map((p) => p.token)).size).toBe(7);
  });

  it("shrink below cursor: re-read length <= from stops the loop and returns the pairs already fetched", async () => {
    const pc = makePc();
    let lengthReads = 0;
    let slices = 0;
    pc.readContract.mockImplementation(async ({ functionName, args }: any) => {
      if (functionName === LENGTH_FN) {
        lengthReads++;
        return lengthReads === 1 ? 9n : 4n;
      }
      slices++;
      if (slices === 2) throw new Error("slice out of bounds");
      const [from, to] = args as [bigint, bigint];
      return RAW.slice(Number(from), Number(to));
    });

    const pairs = await listPairs(makeCtx(pc), { pageSize: 5 });

    expect(lengthReads).toBe(2);
    expect(slices).toBe(2); // no clamped retry after the break
    expect(pairs).toHaveLength(5);
    expect(pairs.map((p) => p.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it("passes revoked pairs (isValid: false) through unfiltered", async () => {
    const pc = makePc();
    pc.readContract.mockImplementation(async ({ functionName, args }: any) => {
      if (functionName === LENGTH_FN) return 9n;
      const [from, to] = args as [bigint, bigint];
      return RAW.slice(Number(from), Number(to));
    });

    const pairs = await listPairs(makeCtx(pc));

    const revoked = pairs.filter((p) => !p.isValid);
    expect(revoked).toHaveLength(1);
    expect(revoked[0]).toEqual({
      token: tokenAddr(4),
      wrapper: wrapperAddr(4),
      isValid: false,
      index: 4,
    });
  });
});

describe("getWrapperForToken", () => {
  const token = tokenAddr(1);
  const wrapper = wrapperAddr(1);

  it("returns null when the registry returns [false, zero address]", async () => {
    const pc = makePc();
    pc.readContract.mockResolvedValue([false, ZERO_ADDRESS]);
    await expect(getWrapperForToken(makeCtx(pc), token)).resolves.toBeNull();
  });

  it("returns { wrapper, isValid: false } for a revoked pair with a real address", async () => {
    const pc = makePc();
    pc.readContract.mockResolvedValue([false, wrapper]);
    await expect(getWrapperForToken(makeCtx(pc), token)).resolves.toEqual({
      wrapper,
      isValid: false,
    });
  });

  it("returns { wrapper, isValid: true } for a valid pair", async () => {
    const pc = makePc();
    pc.readContract.mockResolvedValue([true, wrapper]);
    await expect(getWrapperForToken(makeCtx(pc), token)).resolves.toEqual({
      wrapper,
      isValid: true,
    });
    expect(pc.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "getConfidentialTokenAddress",
        args: [token],
      }),
    );
  });
});

describe("getTokenForWrapper", () => {
  const token = tokenAddr(2);
  const wrapper = wrapperAddr(2);

  it("returns null when the registry returns the zero address", async () => {
    const pc = makePc();
    pc.readContract.mockResolvedValue([false, ZERO_ADDRESS]);
    await expect(getTokenForWrapper(makeCtx(pc), wrapper)).resolves.toBeNull();
  });

  it("returns { token, isValid } for a registered wrapper", async () => {
    const pc = makePc();
    pc.readContract.mockResolvedValue([true, token]);
    await expect(getTokenForWrapper(makeCtx(pc), wrapper)).resolves.toEqual({
      token,
      isValid: true,
    });
    expect(pc.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "getTokenAddress", args: [wrapper] }),
    );
  });
});

describe("isWrapperValid", () => {
  it("returns the contract boolean as-is", async () => {
    const pc = makePc();
    pc.readContract.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const wrapper = wrapperAddr(3);
    await expect(isWrapperValid(makeCtx(pc), wrapper)).resolves.toBe(true);
    await expect(isWrapperValid(makeCtx(pc), wrapper)).resolves.toBe(false);
    expect(pc.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "isConfidentialTokenValid", args: [wrapper] }),
    );
  });
});

describe("registry address resolution", () => {
  it("uses ctx.registry as the contract address when provided", async () => {
    const pc = makePc();
    pc.readContract.mockResolvedValue(true);
    const override = "0x1234567890AbcdEF1234567890aBcdef12345678" as Address;

    await isWrapperValid(makeCtx(pc, override), wrapperAddr(0));

    expect(pc.readContract).toHaveBeenCalledTimes(1);
    expect(pc.readContract.mock.calls[0][0].address).toBe(override);
  });

  it("defaults to REGISTRY[chainId] when no override is given", async () => {
    const pc = makePc();
    pc.readContract.mockResolvedValue(true);

    await isWrapperValid(makeCtx(pc), wrapperAddr(0));

    expect(pc.readContract.mock.calls[0][0].address).toBe(REGISTRY[CHAINS.sepolia]);
  });
});
