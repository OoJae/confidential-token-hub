/**
 * CHECKPOINT-1 SPIKE — the one unproven link before registry-sdk exists:
 * prove that our fhe-client publicDecrypt output finalizes a REAL unwrap on
 * Sepolia (requestId IS the burned-amount handle; proof passed verbatim).
 * Also: empirically probe publicnode's getLogs range tolerance for the
 * pending-unwrap scanner.
 *
 * Run: node scripts/spike-unwrap.ts   (plain node — NEVER tsx)
 */
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";
import { parseEventLogs, type Hex } from "viem";
import { SEPOLIA_MOCKS } from "@cipher/addresses";
import { erc20Abi, erc7984WrapperAbi } from "@cipher/addresses/abis";
import { createNodeFheClient } from "@cipher/fhe-client/node";
import { encryptU64, publicDecrypt, toFheError } from "@cipher/fhe-client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const cUSDC = SEPOLIA_MOCKS.find((m) => m.symbol === "cUSDCMock")!;
const UNWRAP_AMOUNT = 30_000_000n; // 30 cUSDC of the ~225 wrapped during Gate 0

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function assert(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${label}`);
}

async function main() {
  const client = createNodeFheClient({ rpcUrl: RPC, privateKey: process.env.PRIVATE_KEY as Hex });
  const { sdk, publicClient, walletClient, address } = client;
  const summary: Record<string, unknown> = { address };

  try {
    const underlyingBefore = await publicClient.readContract({
      address: cUSDC.underlying,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });

    // ── 1. encrypt the unwrap amount ────────────────────────────────────
    const { handle, inputProof } = await encryptU64(sdk, {
      contractAddress: cUSDC.wrapper,
      userAddress: address,
      value: UNWRAP_AMOUNT,
    });
    console.log(`encrypted input handle: ${handle}`);

    // ── 2. unwrap(from, to, encAmount, proof) ───────────────────────────
    const unwrapHash = await walletClient.writeContract({
      address: cUSDC.wrapper,
      abi: erc7984WrapperAbi,
      functionName: "unwrap",
      args: [address, address, handle, inputProof],
      chain: walletClient.chain,
      account: walletClient.account!,
    });
    console.log(`unwrap tx: ${unwrapHash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: unwrapHash });
    assert(receipt.status === "success", "unwrap receipt success");

    // ── 3. parse UnwrapRequested from the receipt ───────────────────────
    const events = parseEventLogs({
      abi: erc7984WrapperAbi,
      logs: receipt.logs,
      eventName: "UnwrapRequested",
    });
    assert(events.length === 1, `exactly one UnwrapRequested (got ${events.length})`);
    const { receiver, unwrapRequestId } = events[0]!.args as {
      receiver: Hex;
      unwrapRequestId: Hex;
    };
    assert(receiver.toLowerCase() === address.toLowerCase(), "event receiver === us");
    console.log(`unwrapRequestId: ${unwrapRequestId}`);
    summary.requestId = unwrapRequestId;

    // ── 4. pendingness oracle ───────────────────────────────────────────
    const requesterBefore = await publicClient.readContract({
      address: cUSDC.wrapper,
      abi: erc7984WrapperAbi,
      functionName: "unwrapRequester",
      args: [unwrapRequestId],
    });
    assert(
      (requesterBefore as string).toLowerCase() === address.toLowerCase(),
      `unwrapRequester(id) === receiver while pending (got ${requesterBefore})`,
    );

    // ── 5. PUBLIC decrypt the requestId handle (the make-or-break) ──────
    let cleartext: bigint | undefined;
    let decryptionProof: Hex | undefined;
    for (let i = 0; ; i++) {
      try {
        const res = await publicDecrypt(sdk, [unwrapRequestId]);
        const v = res.clearValues[unwrapRequestId] ?? res.clearValues[unwrapRequestId.toLowerCase() as Hex];
        assert(typeof v === "bigint", `clearValues[requestId] is bigint (got ${typeof v})`);
        cleartext = v as bigint;
        decryptionProof = res.decryptionProof;
        break;
      } catch (e) {
        const fe = toFheError(e);
        if (!fe.retryable || i >= 12) throw fe;
        const delay = Math.min(2000 * 2 ** i, 8000);
        console.log(`  public decryption pending — retry in ${delay}ms (${fe.message.slice(0, 80)})`);
        await sleep(delay);
      }
    }
    console.log(`public decrypt: cleartext=${cleartext} proofBytes=${(decryptionProof!.length - 2) / 2}`);
    assert(cleartext === UNWRAP_AMOUNT, `cleartext ${cleartext} === ${UNWRAP_AMOUNT}`);
    summary.cleartext = cleartext!.toString();

    // ── 6. finalizeUnwrap(requestId, cleartext, proof) ──────────────────
    const finalizeHash = await walletClient.writeContract({
      address: cUSDC.wrapper,
      abi: erc7984WrapperAbi,
      functionName: "finalizeUnwrap",
      args: [unwrapRequestId, cleartext!, decryptionProof!],
      chain: walletClient.chain,
      account: walletClient.account!,
    });
    console.log(`finalize tx: ${finalizeHash}`);
    const finReceipt = await publicClient.waitForTransactionReceipt({ hash: finalizeHash });
    assert(finReceipt.status === "success", "finalize receipt success");
    const finalized = parseEventLogs({
      abi: erc7984WrapperAbi,
      logs: finReceipt.logs,
      eventName: "UnwrapFinalized",
    });
    assert(finalized.length === 1, "UnwrapFinalized emitted");

    // ── 7. post-conditions ──────────────────────────────────────────────
    const requesterAfter = await publicClient.readContract({
      address: cUSDC.wrapper,
      abi: erc7984WrapperAbi,
      functionName: "unwrapRequester",
      args: [unwrapRequestId],
    });
    assert(
      requesterAfter === "0x0000000000000000000000000000000000000000",
      `unwrapRequester(id) zeroed after finalize (got ${requesterAfter})`,
    );
    const underlyingAfter = await publicClient.readContract({
      address: cUSDC.underlying,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });
    const delta = (underlyingAfter as bigint) - (underlyingBefore as bigint);
    assert(delta === UNWRAP_AMOUNT * cUSDC.rate, `underlying delta ${delta} === cleartext*rate`);
    summary.underlyingDelta = delta.toString();

    // ── 8. getLogs range tolerance probe (for unwrap/detect.ts) ────────
    const head = await publicClient.getBlockNumber();
    const DEPLOY = 10_162_129n; // registry deploy block (binary-searched via drpc archive)
    for (const range of [50_000n, 200_000n, head - DEPLOY]) {
      const from = head - range < DEPLOY ? DEPLOY : head - range;
      try {
        const logs = await publicClient.getLogs({
          address: cUSDC.wrapper,
          event: erc7984WrapperAbi.find(
            (i) => i.type === "event" && i.name === "UnwrapRequested",
          ) as never,
          args: { receiver: address } as never,
          fromBlock: from,
          toBlock: head,
        });
        console.log(`getLogs range ${range} blocks: OK (${logs.length} logs)`);
        summary[`getLogs_${range}`] = `OK:${logs.length}`;
      } catch (e) {
        const msg = e instanceof Error ? e.message.slice(0, 100) : String(e);
        console.log(`getLogs range ${range} blocks: FAILED (${msg})`);
        summary[`getLogs_${range}`] = `FAIL:${msg}`;
      }
    }

    summary.spike = "GREEN";
    console.log("\n" + JSON.stringify(summary, null, 2));
  } catch (e) {
    const fe = toFheError(e);
    summary.spike = "RED";
    summary.error = fe.message;
    console.error("\n" + JSON.stringify(summary, null, 2));
    if (fe.cause) console.error("cause:", fe.cause);
    process.exitCode = 1;
  } finally {
    client.dispose();
  }
}

main();
