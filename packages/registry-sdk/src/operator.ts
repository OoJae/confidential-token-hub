import { erc7984WrapperAbi } from "@cipher/addresses/abis";
import { RegistryError, toRegistryError } from "./errors.ts";
import type { Address, TxResult, WriteCtx } from "./types.ts";

/** Delegate confidential-transfer rights until `until` (unix seconds, uint48). */
export async function setOperator(
  ctx: WriteCtx,
  p: { wrapper: Address; operator: Address; until: number },
): Promise<TxResult> {
  try {
    const account = ctx.walletClient.account;
    if (!account) throw new RegistryError("WALLET_REQUIRED", "walletClient has no account");
    const txHash = await ctx.walletClient.writeContract({
      address: p.wrapper,
      abi: erc7984WrapperAbi,
      functionName: "setOperator",
      args: [p.operator, p.until],
      chain: ctx.walletClient.chain,
      account,
    });
    const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") throw new RegistryError("UNKNOWN", "setOperator reverted");
    return { txHash, receipt };
  } catch (e) {
    throw toRegistryError(e);
  }
}

/** Revoke = expiry 0 (immediately in the past). */
export async function revokeOperator(
  ctx: WriteCtx,
  p: { wrapper: Address; operator: Address },
): Promise<TxResult> {
  return setOperator(ctx, { ...p, until: 0 });
}
