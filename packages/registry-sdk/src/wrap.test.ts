import { describe, it, expect, vi } from "vitest";
import { CHAINS } from "@cipher/addresses";
import { wrap } from "./wrap.ts";
import { RegistryError } from "./errors.ts";
import { MAX_UINT256, ZERO_ADDRESS } from "./constants.ts";
import type { Address, MinimalPublicClient, MinimalWalletClient, WriteCtx } from "./types.ts";

const WRAPPER = "0x46208622DA27d91db4f0393733C8BA082ed83158" as Address;
const UNDERLYING = "0xff54739b16576FA5402F211D0b938469Ab9A5f3F" as Address;
const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;
const RECIPIENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;

const APPROVE_HASH = `0x${"a1".repeat(32)}` as const;
const WRAP_HASH = `0x${"b2".repeat(32)}` as const;

const RATE = 10n ** 12n;

function makeCtx(opts: {
  pair?: readonly [boolean, Address];
  rate?: bigint;
  allowance?: bigint;
} = {}) {
  const readContract = vi.fn(async (args: { functionName: string }) => {
    switch (args.functionName) {
      case "getTokenAddress":
        return opts.pair ?? ([true, UNDERLYING] as const);
      case "rate":
        return opts.rate ?? RATE;
      case "allowance":
        return opts.allowance ?? 0n;
      default:
        throw new Error(`unexpected readContract: ${args.functionName}`);
    }
  });
  const waitForTransactionReceipt = vi.fn(async (_args: { hash: `0x${string}` }) => ({
    status: "success" as const,
    logs: [],
    blockNumber: 1n,
  }));
  const writeContract = vi
    .fn()
    .mockResolvedValueOnce(APPROVE_HASH)
    .mockResolvedValueOnce(WRAP_HASH);

  const pc = {
    readContract,
    multicall: vi.fn(),
    getLogs: vi.fn(),
    getBlockNumber: vi.fn(),
    waitForTransactionReceipt,
    getChainId: vi.fn(),
  };
  const wc = {
    writeContract,
    account: { address: OWNER, type: "json-rpc" },
    chain: undefined,
  };

  const ctx: WriteCtx = {
    chainId: CHAINS.sepolia,
    publicClient: pc as unknown as MinimalPublicClient,
    walletClient: wc as unknown as MinimalWalletClient,
  };
  return { ctx, readContract, writeContract, waitForTransactionReceipt };
}

async function expectRegistryError(p: Promise<unknown>, code: string): Promise<RegistryError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(RegistryError);
  expect((err as RegistryError).code).toBe(code);
  return err as RegistryError;
}

describe("wrap", () => {
  it("throws ROUNDED_TO_ZERO before any write when amount < rate, with meta.rate", async () => {
    const { ctx, writeContract } = makeCtx({ rate: RATE });
    const err = await expectRegistryError(
      wrap(ctx, { wrapper: WRAPPER, amount: RATE - 1n }),
      "ROUNDED_TO_ZERO",
    );
    expect(err.meta).toBeDefined();
    expect(err.meta?.rate).toBe(RATE);
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("throws WRAPPER_REVOKED for a revoked pair before any write", async () => {
    const { ctx, writeContract } = makeCtx({ pair: [false, UNDERLYING] });
    await expectRegistryError(
      wrap(ctx, { wrapper: WRAPPER, amount: 10n * RATE }),
      "WRAPPER_REVOKED",
    );
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("throws PAIR_NOT_FOUND for an unknown wrapper (zero underlying)", async () => {
    const { ctx, writeContract } = makeCtx({ pair: [false, ZERO_ADDRESS] });
    await expectRegistryError(
      wrap(ctx, { wrapper: WRAPPER, amount: 10n * RATE }),
      "PAIR_NOT_FOUND",
    );
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("skips approve when allowance is sufficient and sends exactly one wrap write", async () => {
    const amount = 1_000n;
    const { ctx, writeContract, waitForTransactionReceipt } = makeCtx({
      rate: 1n,
      allowance: amount, // == pulled, so no approve needed
    });
    const result = await wrap(ctx, { wrapper: WRAPPER, amount });

    expect(writeContract).toHaveBeenCalledTimes(1);
    const call = writeContract.mock.calls[0]![0];
    expect(call.functionName).toBe("wrap");
    expect(call.address).toBe(WRAPPER);
    // default `to` = wallet account address
    expect(call.args).toEqual([OWNER, amount]);

    expect(result.approveTxHash).toBeUndefined();
    expect(result.txHash).toBe(APPROVE_HASH); // first mocked hash goes to the single wrap write
    expect(waitForTransactionReceipt).toHaveBeenCalledTimes(1);
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: APPROVE_HASH });
  });

  it("approves the rounded `pulled` amount (not the raw amount) by default, then wraps", async () => {
    const amount = 1_500_000_000_000_500n;
    const pulled = 1_500_000_000_000_000n; // amount - amount % rate
    const { ctx, writeContract, waitForTransactionReceipt } = makeCtx({
      rate: RATE,
      allowance: 0n,
    });
    const onApproveSubmitted = vi.fn();
    const onWrapSubmitted = vi.fn();

    const result = await wrap(ctx, {
      wrapper: WRAPPER,
      amount,
      to: RECIPIENT,
      onApproveSubmitted,
      onWrapSubmitted,
    });

    expect(writeContract).toHaveBeenCalledTimes(2);
    const approveCall = writeContract.mock.calls[0]![0];
    expect(approveCall.functionName).toBe("approve");
    expect(approveCall.address).toBe(UNDERLYING);
    expect(approveCall.args).toEqual([WRAPPER, pulled]);
    expect(approveCall.args[1]).not.toBe(amount);

    const wrapCall = writeContract.mock.calls[1]![0];
    expect(wrapCall.functionName).toBe("wrap");
    expect(wrapCall.address).toBe(WRAPPER);
    expect(wrapCall.args).toEqual([RECIPIENT, amount]);

    // Both receipts awaited, in order.
    expect(waitForTransactionReceipt).toHaveBeenCalledTimes(2);
    expect(waitForTransactionReceipt).toHaveBeenNthCalledWith(1, { hash: APPROVE_HASH });
    expect(waitForTransactionReceipt).toHaveBeenNthCalledWith(2, { hash: WRAP_HASH });

    expect(result.approveTxHash).toBe(APPROVE_HASH);
    expect(result.txHash).toBe(WRAP_HASH);
    expect(onApproveSubmitted).toHaveBeenCalledWith(APPROVE_HASH);
    expect(onWrapSubmitted).toHaveBeenCalledWith(WRAP_HASH);
  });

  it('approval "max" approves 2^256-1', async () => {
    const { ctx, writeContract } = makeCtx({ rate: 1n, allowance: 0n });
    await wrap(ctx, { wrapper: WRAPPER, amount: 1_000n, approval: "max" });

    expect(writeContract).toHaveBeenCalledTimes(2);
    const approveCall = writeContract.mock.calls[0]![0];
    expect(approveCall.functionName).toBe("approve");
    expect(approveCall.args[1]).toBe(2n ** 256n - 1n);
    expect(approveCall.args[1]).toBe(MAX_UINT256);
  });

  it('approval "skip" with short allowance throws APPROVAL_REQUIRED with meta', async () => {
    const { ctx, writeContract } = makeCtx({ rate: 1n, allowance: 400n });
    const err = await expectRegistryError(
      wrap(ctx, { wrapper: WRAPPER, amount: 1_000n, approval: "skip" }),
      "APPROVAL_REQUIRED",
    );
    expect(err.meta).toEqual({ allowance: 400n, required: 1_000n });
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("returns exact requested/pulled/minted/remainder math for rate=1e12", async () => {
    const amount = 1_500_000_000_000_500n;
    const { ctx } = makeCtx({ rate: RATE, allowance: MAX_UINT256 });
    const result = await wrap(ctx, { wrapper: WRAPPER, amount });

    expect(result.requested).toBe(1_500_000_000_000_500n);
    expect(result.pulled).toBe(1_500_000_000_000_000n);
    expect(result.minted).toBe(1_500n);
    expect(result.remainder).toBe(500n);
    expect(result.rate).toBe(RATE);
  });

  it("throws UNKNOWN when the wrap receipt reverts", async () => {
    const { ctx, waitForTransactionReceipt } = makeCtx({
      rate: 1n,
      allowance: MAX_UINT256, // no approve — the only receipt is the wrap's
    });
    waitForTransactionReceipt.mockResolvedValueOnce({
      status: "reverted" as never,
      logs: [],
      blockNumber: 1n,
    });
    await expectRegistryError(wrap(ctx, { wrapper: WRAPPER, amount: 1_000n }), "UNKNOWN");
  });
});
