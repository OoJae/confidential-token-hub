import { parseEventLogs } from "viem";
import { erc7984WrapperAbi } from "@cipher/addresses/abis";
import { ZERO_ADDRESS } from "../constants.ts";
import { RegistryError, toRegistryError } from "../errors.ts";
import type { Address, FheAdapter, Hex, TxResult, WriteCtx } from "../types.ts";
import type { UnwrapStore } from "./store.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface UnwrapStartResult extends TxResult {
  requestId: Hex;
  receiver: Address;
  requestBlock: bigint;
}

/**
 * Step 1 of the two-step async unwrap: encrypt the amount, submit
 * unwrap(from, to, encAmount, proof), parse UnwrapRequested, and persist the
 * record BEFORE returning (rule 2: survive refresh).
 */
export async function unwrapStart(
  ctx: WriteCtx & { fhe: FheAdapter; store?: UnwrapStore },
  p: { wrapper: Address; amount: bigint; from?: Address; to?: Address },
): Promise<UnwrapStartResult> {
  try {
    const account = ctx.walletClient.account;
    if (!account) throw new RegistryError("WALLET_REQUIRED", "walletClient has no account");
    const initiator = account.address as Address;
    const from = p.from ?? initiator;
    const to = p.to ?? initiator;

    const { handle, inputProof } = await ctx.fhe.encryptU64({
      contractAddress: p.wrapper,
      userAddress: initiator,
      value: p.amount,
    });

    const txHash = await ctx.walletClient.writeContract({
      address: p.wrapper,
      abi: erc7984WrapperAbi,
      functionName: "unwrap",
      args: [from, to, handle, inputProof],
      chain: ctx.walletClient.chain,
      account,
    });
    const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") throw new RegistryError("UNKNOWN", "unwrap reverted");

    const events = parseEventLogs({
      abi: erc7984WrapperAbi,
      logs: receipt.logs,
      eventName: "UnwrapRequested",
    });
    const event = events[0];
    if (!event) throw new RegistryError("UNKNOWN", "no UnwrapRequested event in unwrap receipt");
    const { receiver, unwrapRequestId } = event.args as { receiver: Address; unwrapRequestId: Hex };

    ctx.store?.upsert({
      requestId: unwrapRequestId,
      wrapper: p.wrapper,
      receiver,
      initiator,
      requestTxHash: txHash,
      requestBlock: receipt.blockNumber.toString(),
      createdAt: Date.now(),
      status: "requested",
    });

    return { txHash, receipt, requestId: unwrapRequestId, receiver, requestBlock: receipt.blockNumber };
  } catch (e) {
    throw toRegistryError(e);
  }
}

export interface UnwrapFinalizeResult extends TxResult {
  cleartext: bigint;
}

/**
 * Step 2: publicly decrypt the requestId (which IS the burned-amount euint64
 * handle — proven on Sepolia, see docs/SDK-VERIFICATION.md) and submit
 * finalizeUnwrap(requestId, cleartext, decryptionProof) with the proof
 * verbatim. Idempotent to retry: finalizeUnwrap is permissionless and
 * publicDecrypt is a pure read; on failure the record reverts to "requested".
 */
export async function unwrapFinalize(
  ctx: WriteCtx & { fhe: FheAdapter; store?: UnwrapStore },
  p: { wrapper: Address; requestId: Hex; maxDecryptAttempts?: number },
): Promise<UnwrapFinalizeResult> {
  const account = ctx.walletClient.account;
  if (!account) throw new RegistryError("WALLET_REQUIRED", "walletClient has no account");

  // Pendingness oracle: unwrapRequester(id) is address(0) after finalize.
  const requester = await ctx.publicClient.readContract({
    address: p.wrapper,
    abi: erc7984WrapperAbi,
    functionName: "unwrapRequester",
    args: [p.requestId],
  });
  if (requester === ZERO_ADDRESS) {
    if (ctx.store?.get(p.requestId)) ctx.store.patch(p.requestId, { status: "finalized" });
    throw new RegistryError(
      "NO_PENDING_REQUEST",
      "this unwrap request is unknown or already finalized",
    );
  }

  ctx.store?.patch(p.requestId, { status: "finalizing" });
  try {
    // Public-decrypt with backoff on DECRYPTION_PENDING.
    const maxAttempts = p.maxDecryptAttempts ?? 12;
    let cleartext: bigint | undefined;
    let decryptionProof: Hex | undefined;
    for (let i = 0; ; i++) {
      try {
        const res = await ctx.fhe.publicDecrypt([p.requestId]);
        // Normalize keys — adapters may return checksummed/lowercase hex.
        const wanted = p.requestId.toLowerCase();
        const entry = Object.entries(res.clearValues).find(([k]) => k.toLowerCase() === wanted);
        const v = entry?.[1];
        if (typeof v !== "bigint") {
          throw new RegistryError("UNKNOWN", `unexpected clear value: ${String(v)}`);
        }
        cleartext = v;
        decryptionProof = res.decryptionProof;
        break;
      } catch (e) {
        const err = toRegistryError(e);
        if (!err.retryable || i >= maxAttempts) throw err;
        await sleep(Math.min(1500 * 2 ** i, 8000));
      }
    }

    const txHash = await ctx.walletClient.writeContract({
      address: p.wrapper,
      abi: erc7984WrapperAbi,
      functionName: "finalizeUnwrap",
      args: [p.requestId, cleartext!, decryptionProof!],
      chain: ctx.walletClient.chain,
      account,
    });
    const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") throw new RegistryError("UNKNOWN", "finalizeUnwrap reverted");

    ctx.store?.patch(p.requestId, {
      status: "finalized",
      finalizeTxHash: txHash,
      cleartext: cleartext!.toString(),
    });
    return { txHash, receipt, cleartext: cleartext! };
  } catch (e) {
    // Revert to "requested" so the record stays detectable/retryable.
    ctx.store?.patch(p.requestId, { status: "requested" });
    throw toRegistryError(e);
  }
}
