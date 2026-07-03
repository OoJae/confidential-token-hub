/**
 * TOKEN HUB E2E — the full judged flow on live Sepolia, driven through
 * @cipher/registry-sdk (this script doubles as the SDK's Node reference
 * consumer): faucet → wrap → reveal (sign-once) → unwrap start → FINALIZE
 * (the correctness centerpiece) → arithmetic post-conditions.
 *
 * Run: pnpm e2e:hub   (plain node — NEVER tsx; needs funded PRIVATE_KEY)
 * Exit 0 GREEN · 1 assertion/flow failure · 2 unfunded.
 */
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";
import { formatEther } from "viem";
import { CHAINS, SEPOLIA_MOCKS } from "@cipher/addresses";
import { erc20Abi } from "@cipher/addresses/abis";
import { createNodeFheClient } from "@cipher/fhe-client/node";
import { createFheAdapter, ensurePermit } from "@cipher/fhe-client";
import { createRegistrySdk } from "@cipher/registry-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const cUSDC = SEPOLIA_MOCKS.find((m) => m.symbol === "cUSDCMock")!;
const WRAP = 50_000_000n; // 50 USDC
const UNWRAP = 20_000_000n; // 20 cUSDC

function assert(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${label}`);
}

async function main() {
  const client = createNodeFheClient({
    rpcUrl: RPC,
    privateKey: process.env.PRIVATE_KEY as `0x${string}`,
  });
  const { publicClient, walletClient, address } = client;
  const summary: Record<string, unknown> = { address };

  const sdk = createRegistrySdk({
    chainId: CHAINS.sepolia,
    publicClient,
    walletClient,
    fhe: createFheAdapter(client.sdk),
  });

  try {
    // ── 1. preflight ───────────────────────────────────────────────────
    assert((await publicClient.getChainId()) === CHAINS.sepolia, "chainId 11155111");
    const gas = await publicClient.getBalance({ address });
    console.log(`gas: ${formatEther(gas)} ETH`);
    if (gas < 3_000_000_000_000_000n) {
      console.error(`⛽ fund ${address} with Sepolia ETH and re-run`);
      process.exit(2);
    }

    // ── 2. coverage: enumerate + every pair's meta degrades-not-throws ──
    const pairs = await sdk.listPairs();
    assert(pairs.length >= 9, `registry pairs ${pairs.length} >= 9`);
    for (const pair of pairs) {
      const meta = await sdk.getWrapperMeta(pair.wrapper);
      assert(typeof meta.symbol === "string", `meta(${pair.wrapper}) resolved`);
    }
    console.log(`coverage: ${pairs.length} pairs, all metas resolved`);
    summary.pairs = pairs.length;

    // ── 3. faucet (if needed) ──────────────────────────────────────────
    const underlyingBal = await publicClient.readContract({
      address: cUSDC.underlying,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });
    if (underlyingBal < WRAP + 25_000_000n) {
      const res = await sdk.faucetMint({ underlying: cUSDC.underlying, amount: 1_000_000_000n });
      console.log(`faucet mint: ${res.txHash}`);
    }

    // ── 4. wrap composite (approve handled internally) ─────────────────
    const wrapRes = await sdk.wrap({ wrapper: cUSDC.wrapper, amount: WRAP });
    console.log(
      `wrap: ${wrapRes.txHash} minted=${wrapRes.minted} remainder=${wrapRes.remainder}${wrapRes.approveTxHash ? ` (approve ${wrapRes.approveTxHash})` : ""}`,
    );
    assert(wrapRes.minted === WRAP / wrapRes.rate, "wrap math");

    // ── 5. reveal (sign-once) ──────────────────────────────────────────
    await ensurePermit(client.sdk, [cUSDC.wrapper]);
    const bal1 = await sdk.decryptBalance(cUSDC.wrapper, address);
    assert(!bal1.uninitialized && bal1.value >= WRAP, `revealed ${bal1.value} >= ${WRAP}`);
    assert(client.signCount() === 1, `signCount === 1 (got ${client.signCount()})`);
    console.log(`reveal #1: ${bal1.value} (signCount ${client.signCount()})`);
    summary.balanceAfterWrap = bal1.value.toString();

    // ── 6. snapshot for post-conditions ────────────────────────────────
    const meta0 = await sdk.getWrapperMeta(cUSDC.wrapper);
    const underlyingBefore = await publicClient.readContract({
      address: cUSDC.underlying,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });

    // ── 7. unwrap start ────────────────────────────────────────────────
    const startRes = await sdk.unwrapStart({ wrapper: cUSDC.wrapper, amount: UNWRAP });
    console.log(`unwrap start: ${startRes.txHash} requestId=${startRes.requestId}`);
    summary.requestId = startRes.requestId;

    // detection: the pending scanner must see it (store ∪ recent scan)
    const pending = await sdk.pendingUnwraps({ account: address, wrappers: [cUSDC.wrapper] });
    assert(
      pending.some((r) => r.requestId === startRes.requestId),
      "pendingUnwraps detects the fresh request",
    );

    // ── 8. FINALIZE — the centerpiece ──────────────────────────────────
    const fin = await sdk.unwrapFinalize({ wrapper: cUSDC.wrapper, requestId: startRes.requestId });
    console.log(`finalize: ${fin.txHash} cleartext=${fin.cleartext}`);
    assert(fin.cleartext === UNWRAP, `cleartext ${fin.cleartext} === ${UNWRAP}`);
    summary.cleartext = fin.cleartext.toString();

    // ── 9. post-conditions ─────────────────────────────────────────────
    const underlyingAfter = await publicClient.readContract({
      address: cUSDC.underlying,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });
    assert(
      underlyingAfter - underlyingBefore === UNWRAP * meta0.rate,
      `underlying delta === ${UNWRAP} * rate`,
    );

    const meta1 = await sdk.getWrapperMeta(cUSDC.wrapper);
    assert(meta0.tvs - meta1.tvs === UNWRAP, `TVS shrank by exactly ${UNWRAP}`);

    const bal2 = await sdk.decryptBalance(cUSDC.wrapper, address);
    assert(bal1.value - bal2.value === UNWRAP, `re-reveal delta ${bal1.value - bal2.value} === ${UNWRAP}`);
    assert(client.signCount() === 1, `SIGN-ONCE held: signCount still 1 (got ${client.signCount()})`);
    summary.balanceAfterUnwrap = bal2.value.toString();
    summary.signCount = client.signCount();

    const stillPending = await sdk.pendingUnwraps({ account: address, wrappers: [cUSDC.wrapper] });
    assert(
      !stillPending.some((r) => r.requestId === startRes.requestId),
      "finalized request no longer pending",
    );

    summary.e2e = "GREEN";
    console.log("\n" + JSON.stringify(summary, null, 2));
  } catch (e) {
    summary.e2e = "RED";
    summary.error = e instanceof Error ? e.message : String(e);
    console.error("\n" + JSON.stringify(summary, null, 2));
    if (e instanceof Error && e.cause) console.error("cause:", e.cause);
    process.exitCode = 1;
  } finally {
    client.dispose();
  }
}

main();
