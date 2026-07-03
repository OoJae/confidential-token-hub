import { erc20Abi, erc7984WrapperAbi } from "@cipher/addresses/abis";
import { MAX_UINT256 } from "./constants.ts";
import { RegistryError, toRegistryError } from "./errors.ts";
import { getTokenForWrapper } from "./registry.ts";
import { getAllowance } from "./wrapper-reads.ts";
import type { Address, Hex, TxResult, WriteCtx } from "./types.ts";

export interface WrapParams {
  wrapper: Address;
  /** Underlying base units. */
  amount: bigint;
  /** Recipient of the confidential tokens. Default: the wallet account. */
  to?: Address;
  /**
   * "exact" (default): approve exactly what the wrapper will pull — zero
   * residual allowance. "max": one-time unlimited approve. "skip": throw
   * APPROVAL_REQUIRED instead of approving.
   */
  approval?: "exact" | "max" | "skip";
  onApproveSubmitted?: (txHash: Hex) => void;
  onWrapSubmitted?: (txHash: Hex) => void;
}

export interface WrapResult extends TxResult {
  approveTxHash?: Hex;
  /** What the caller asked to wrap. */
  requested: bigint;
  /** amount - amount % rate — what the wrapper transferFrom'd. */
  pulled: bigint;
  /** amount / rate — wrapper base units credited to `to`. */
  minted: bigint;
  /** amount % rate — NEVER left the caller's wallet (not a refund transfer). */
  remainder: bigint;
  rate: bigint;
}

/**
 * Composite approve→wrap. Pre-checks ROUNDED_TO_ZERO (before any gas is
 * spent) and refuses revoked wrappers.
 */
export async function wrap(ctx: WriteCtx, params: WrapParams): Promise<WrapResult> {
  try {
    const account = ctx.walletClient.account;
    if (!account) throw new RegistryError("WALLET_REQUIRED", "walletClient has no account");
    const owner = account.address as Address;
    const to = params.to ?? owner;

    const pairInfo = await getTokenForWrapper(ctx, params.wrapper);
    if (!pairInfo) throw new RegistryError("PAIR_NOT_FOUND", `${params.wrapper} is not in the registry`);
    if (!pairInfo.isValid) {
      throw new RegistryError("WRAPPER_REVOKED", `${params.wrapper} was revoked by the Protocol DAO`);
    }
    const underlying = pairInfo.token;

    const rate = await ctx.publicClient.readContract({
      address: params.wrapper,
      abi: erc7984WrapperAbi,
      functionName: "rate",
    });

    if (params.amount < rate) {
      throw new RegistryError(
        "ROUNDED_TO_ZERO",
        `amount ${params.amount} is below the wrapper rate ${rate} and would mint 0`,
        { meta: { rate } },
      );
    }

    const remainder = params.amount % rate;
    const pulled = params.amount - remainder;
    const minted = params.amount / rate;

    let approveTxHash: Hex | undefined;
    const allowance = await getAllowance(ctx, underlying, owner, params.wrapper);
    if (allowance < pulled) {
      const mode = params.approval ?? "exact";
      if (mode === "skip") {
        throw new RegistryError(
          "APPROVAL_REQUIRED",
          `allowance ${allowance} < required ${pulled}`,
          { meta: { allowance, required: pulled } },
        );
      }
      approveTxHash = await ctx.walletClient.writeContract({
        address: underlying,
        abi: erc20Abi,
        functionName: "approve",
        args: [params.wrapper, mode === "max" ? MAX_UINT256 : pulled],
        chain: ctx.walletClient.chain,
        account,
      });
      params.onApproveSubmitted?.(approveTxHash);
      const approveReceipt = await ctx.publicClient.waitForTransactionReceipt({
        hash: approveTxHash,
      });
      if (approveReceipt.status !== "success") {
        throw new RegistryError("APPROVAL_REQUIRED", "approve transaction reverted");
      }
    }

    // INVARIANT: we approve `pulled` but wrap with the full `amount` — correct
    // because the OZ wrapper transferFroms `amount - amount % rate()`, never
    // the raw amount. A non-OZ wrapper that pulled the raw amount would make
    // exact-mode wraps of non-rate-multiples revert on allowance.
    const txHash = await ctx.walletClient.writeContract({
      address: params.wrapper,
      abi: erc7984WrapperAbi,
      functionName: "wrap",
      args: [to, params.amount],
      chain: ctx.walletClient.chain,
      account,
    });
    params.onWrapSubmitted?.(txHash);
    const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      throw new RegistryError("UNKNOWN", "wrap transaction reverted");
    }

    return {
      txHash,
      receipt,
      approveTxHash,
      requested: params.amount,
      pulled,
      minted,
      remainder,
      rate,
    };
  } catch (e) {
    throw toRegistryError(e);
  }
}
