import { parseEventLogs } from "viem";
import { erc7984WrapperAbi } from "@cipher/addresses/abis";
import { RegistryError, toRegistryError } from "./errors.ts";
import type { Address, FheAdapter, Hex, TxResult, WriteCtx } from "./types.ts";

/**
 * Confidential transfer. FHE rule 3: a transfer of more than the balance
 * SUCCEEDS on-chain moving an encrypted zero — tx success is not proof of
 * transfer. The emitted transferred-amount handle is returned so callers can
 * reveal-to-verify.
 */
export async function confidentialTransfer(
  ctx: WriteCtx & { fhe: FheAdapter },
  p: { wrapper: Address; to: Address; amount: bigint },
): Promise<TxResult & { amountHandle: Hex | null }> {
  try {
    const account = ctx.walletClient.account;
    if (!account) throw new RegistryError("WALLET_REQUIRED", "walletClient has no account");

    const { handle, inputProof } = await ctx.fhe.encryptU64({
      contractAddress: p.wrapper,
      userAddress: account.address as Address,
      value: p.amount,
    });

    const txHash = await ctx.walletClient.writeContract({
      address: p.wrapper,
      abi: erc7984WrapperAbi,
      functionName: "confidentialTransfer",
      args: [p.to, handle, inputProof],
      chain: ctx.walletClient.chain,
      account,
    });
    const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") throw new RegistryError("UNKNOWN", "transfer reverted");

    const events = parseEventLogs({
      abi: erc7984WrapperAbi,
      logs: receipt.logs,
      eventName: "ConfidentialTransfer",
    });
    const amountHandle =
      events.length > 0 ? ((events[0]!.args as { amount: Hex }).amount ?? null) : null;

    return { txHash, receipt, amountHandle };
  } catch (e) {
    throw toRegistryError(e);
  }
}
