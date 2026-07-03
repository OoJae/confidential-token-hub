import { describe, it, expect, vi } from "vitest";
import { CHAINS, MINT_CAP_WHOLE, SEPOLIA_MOCKS, toBaseUnits } from "@cipher/addresses";
import { faucetMint } from "./faucet.ts";
import { RegistryError } from "./errors.ts";
import type { Address, MinimalPublicClient, MinimalWalletClient, WriteCtx } from "./types.ts";

const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;
const RECIPIENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
const UNKNOWN_UNDERLYING = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address;

const USDC_MOCK = SEPOLIA_MOCKS.find((m) => m.symbol === "cUSDCMock")!;

const MINT_HASH = `0x${"c3".repeat(32)}` as const;

function makeCtx(opts: { decimals?: bigint } = {}) {
  const readContract = vi.fn(async (args: { functionName: string }) => {
    if (args.functionName === "decimals") return opts.decimals ?? 18n;
    throw new Error(`unexpected readContract: ${args.functionName}`);
  });
  const waitForTransactionReceipt = vi.fn(async (_args: { hash: `0x${string}` }) => ({
    status: "success" as const,
    logs: [],
    blockNumber: 1n,
  }));
  const writeContract = vi.fn().mockResolvedValue(MINT_HASH);

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

describe("faucetMint", () => {
  it("throws FAUCET_CAP_EXCEEDED pre-tx for a known mock underlying, with meta", async () => {
    const { ctx, readContract, writeContract } = makeCtx();
    const cap = toBaseUnits(MINT_CAP_WHOLE, USDC_MOCK.underlyingDecimals); // 1e12 for 6 decimals
    const requested = cap + 1n;

    const err = await expectRegistryError(
      faucetMint(ctx, { underlying: USDC_MOCK.underlying, amount: requested }),
      "FAUCET_CAP_EXCEEDED",
    );
    expect(err.meta).toEqual({ requested, cap });
    expect(writeContract).not.toHaveBeenCalled();
    // Known mock — decimals come from the address book, not the chain.
    expect(readContract).not.toHaveBeenCalled();
  });

  it("reads decimals() on-chain for an unknown underlying and computes the cap from it", async () => {
    const { ctx, readContract, writeContract } = makeCtx({ decimals: 18n });
    const cap18 = toBaseUnits(MINT_CAP_WHOLE, 18); // 1e24

    const err = await expectRegistryError(
      faucetMint(ctx, { underlying: UNKNOWN_UNDERLYING, amount: cap18 + 1n }),
      "FAUCET_CAP_EXCEEDED",
    );
    expect(readContract).toHaveBeenCalledTimes(1);
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: UNKNOWN_UNDERLYING, functionName: "decimals" }),
    );
    expect(err.meta?.cap).toBe(cap18);
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("mints [to, amount] under the cap, awaits the receipt, and returns a TxResult", async () => {
    const { ctx, writeContract, waitForTransactionReceipt } = makeCtx();
    const amount = toBaseUnits(MINT_CAP_WHOLE, USDC_MOCK.underlyingDecimals); // exactly the cap is allowed

    const result = await faucetMint(ctx, {
      underlying: USDC_MOCK.underlying,
      amount,
      to: RECIPIENT,
    });

    expect(writeContract).toHaveBeenCalledTimes(1);
    const call = writeContract.mock.calls[0]![0];
    expect(call.functionName).toBe("mint");
    expect(call.address).toBe(USDC_MOCK.underlying);
    expect(call.args).toEqual([RECIPIENT, amount]);

    expect(waitForTransactionReceipt).toHaveBeenCalledTimes(1);
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: MINT_HASH });

    expect(result.txHash).toBe(MINT_HASH);
    expect(result.receipt).toEqual({ status: "success", logs: [], blockNumber: 1n });
  });

  it("defaults `to` to the wallet account address", async () => {
    const { ctx, writeContract } = makeCtx();
    await faucetMint(ctx, { underlying: USDC_MOCK.underlying, amount: 5_000_000n });

    const call = writeContract.mock.calls[0]![0];
    expect(call.args).toEqual([OWNER, 5_000_000n]);
  });
});
