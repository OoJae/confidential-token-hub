import { MINT_CAP_WHOLE, SEPOLIA_MOCKS, toBaseUnits } from "@cipher/addresses";
import { erc20Abi } from "@cipher/addresses/abis";
import { RegistryError, toRegistryError } from "./errors.ts";
import type { Address, TxResult, WriteCtx } from "./types.ts";

/**
 * Mint mock underlying tokens. Cap-aware: the mocks allow at most 1,000,000
 * WHOLE tokens per call (amount argument in BASE units) — checked before any
 * transaction; an on-chain cap revert (selector 0x3a91f045) also maps cleanly.
 */
export async function faucetMint(
  ctx: WriteCtx,
  p: { underlying: Address; amount: bigint; to?: Address },
): Promise<TxResult> {
  try {
    const account = ctx.walletClient.account;
    if (!account) throw new RegistryError("WALLET_REQUIRED", "walletClient has no account");
    const to = p.to ?? (account.address as Address);

    const known = SEPOLIA_MOCKS.find(
      (m) => m.underlying.toLowerCase() === p.underlying.toLowerCase(),
    );
    const decimals =
      known?.underlyingDecimals ??
      Number(
        await ctx.publicClient.readContract({
          address: p.underlying,
          abi: erc20Abi,
          functionName: "decimals",
        }),
      );

    const cap = toBaseUnits(MINT_CAP_WHOLE, decimals);
    if (p.amount > cap) {
      throw new RegistryError(
        "FAUCET_CAP_EXCEEDED",
        `max ${MINT_CAP_WHOLE} whole tokens per mint call`,
        { meta: { requested: p.amount, cap } },
      );
    }

    const txHash = await ctx.walletClient.writeContract({
      address: p.underlying,
      abi: erc20Abi,
      functionName: "mint",
      args: [to, p.amount],
      chain: ctx.walletClient.chain,
      account,
    });
    const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") throw new RegistryError("UNKNOWN", "mint reverted");
    return { txHash, receipt };
  } catch (e) {
    throw toRegistryError(e);
  }
}
