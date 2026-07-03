# Confidential Token Hub

**An Etherscan-grade explorer for the Zama Confidential Token Wrappers Registry — plus the reusable, typed SDK it's built on.**

🔗 **Live**: https://confidential-token-hub.vercel.app · Sepolia (actions) + Ethereum mainnet (read-only)

Every ERC-20 ↔ ERC-7984 wrapper pair, enumerated live from the on-chain registry: wrap, unwrap (the full two-step async flow), transfer confidentially, manage operators, mint test tokens — with balances that stay encrypted on-chain and reveal only to you, after **one** signature per session.

Built for the Zama Developer Program **Season 3 Bounty track** on the [Zama Protocol](https://docs.zama.org/protocol) (FHEVM, ERC-7984).

## What's private vs public

| | Visibility |
|---|---|
| Pair addresses, validity, `rate()`, decimals | **Public** |
| Total Value Shielded (the wrapper's escrowed ERC-20 balance) | **Public** |
| That a wrap / transfer / unwrap transaction happened | **Public** |
| Confidential balances (euint64 ciphertext handles) | **Private** — EIP-712 user-decryption, revealed only to the owner |
| Transfer amounts and wrap credits | **Private** |
| Unwrap amounts | **Private until finalization** (finalize publicly decrypts the amount to release the ERC-20) |

## Architecture

```mermaid
flowchart LR
  subgraph app [apps/token-hub — Next.js 16]
    UI[Explorer · Detail · Portfolio · Faucet]
  end
  subgraph sdk [packages/registry-sdk]
    CORE[pure-viem core\nreads need NO WASM]
    HOOKS[React hooks\nchainId-explicit]
  end
  subgraph fhe [packages/fhe-client]
    ADAPTER[FheAdapter\nencrypt · userDecrypt · publicDecrypt]
  end
  UI --> HOOKS --> CORE
  HOOKS -. FHE ops .-> ADAPTER
  CORE --> REG[(Wrappers Registry\n+ ERC-7984 wrappers)]
  ADAPTER --> ZAMA[@zama-fhe/sdk v3\nrelayer.testnet.zama.org/v2]
  CORE --- ADDR[packages/addresses\nverified address book + ABIs]
```

The app is the **reference consumer** of `@cipher/registry-sdk` — everything the UI does, the SDK does for any dApp in a few lines.

## Quickstart

```bash
pnpm install
pnpm build:packages       # builds the @cipher/addresses address book
pnpm dev                  # http://localhost:3000
```

No env needed for the UI (public RPC defaults). For the E2E script: `cp .env.example .env` and set a **testnet-only** `PRIVATE_KEY` with Sepolia ETH.

## The SDK in 10 lines (`packages/registry-sdk`)

```ts
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { createRegistrySdk } from "@cipher/registry-sdk";

const sdk = createRegistrySdk({
  chainId: sepolia.id,
  publicClient: createPublicClient({ chain: sepolia, transport: http() }),
});
const pairs = await sdk.listPairs();                      // every pair — revoked ones included
console.log(await sdk.getWrapperMeta(pairs[0].wrapper));  // { symbol, rate, tvs, maxSupply, … }
```

Read-only consumers install **no WASM, no relayer client, no `@zama-fhe/*`** — FHE operations plug in through a 3-method `FheAdapter`. Full API, the two-step unwrap lifecycle, and the multi-pending unwrap store: [`packages/registry-sdk/README.md`](packages/registry-sdk/README.md).

## Correctness receipts

The judged hard parts are machine-verified against live Sepolia (`pnpm e2e`):

```json
{
  "pairs": 9,
  "balanceAfterWrap": "245000000",
  "requestId": "0x1a90baa510b35bf935944fd98401eed3836278dfc5ff0000000000aa36a70500",
  "cleartext": "20000000",
  "balanceAfterUnwrap": "225000000",
  "signCount": 1,
  "e2e": "GREEN"
}
```

- **Two-step unwrap**: `unwrap` → parse `UnwrapRequested` → public-decrypt the requestId (it IS the burned-amount handle) → `finalizeUnwrap(requestId, cleartext, proof)` with the KMS proof verbatim. Refresh-safe: records persist before `unwrapStart` returns; the portfolio detects and finalizes outstanding requests (local store ∪ receiver-filtered event scan, each candidate verified via `unwrapRequester`).
- **Sign-once**: one EIP-712 permit covers every wrapper; `signCount === 1` is asserted across all reveals.
- **Never a fake zero**: an undisclosed balance renders as a locked badge — the revealed cleartext is cached per ciphertext handle, so a balance change re-locks the row by construction.
- 63 offline unit tests: `pnpm test` (pagination races, revoked pairs, wrap rounding, faucet cap, unwrap state machine, log-scan chunking).

## Addresses (verified on-chain)

| | Sepolia | Mainnet |
|---|---|---|
| Wrappers Registry | `0x2f0750Bbb0A246059d80e94c454586a7F27a128e` | `0xeb5015fF021DB115aCe010f23F55C2591059bBA0` |

Sepolia mock pairs (wrapper / underlying / decimals): cUSDCMock `0x7c5B…3639` / `0x9b5C…DFfF` (6/6), cUSDTMock `0x4E7B…4491` / `0xa7dA…e9b0` (6/6), cWETHMock `0x4620…3158` / `0xff54…5f3F` (18→6, rate 1e12), cBRONMock `0xaa56…C891` (18→6), cZAMAMock `0xf2D6…fbFB` (18→6), ctGBPMock `0xfCE5…F7CC` (18→6), cXAUtMock `0xe4Fc…60C7` (6/6). The explorer enumerates **dynamically** — new registry entries appear with zero code change.

## Design notes

- **Sign once per session** — the transport keypair + permit live in tab-scoped sessionStorage (the SDK stores them in plaintext, so no IndexedDB by default), TTL-bounded.
- **Revoked pairs are shown, never hidden** — warning state, wrap/transfer disabled, unwrap still enabled (funds are never trapped).
- Faucet amounts go through `toBaseUnits` with per-token verified decimals (6 vs 18) and the 1,000,000-token cap is pre-checked before any gas is spent.
- Mainnet is read-only by policy: every action is disabled *with an explanation and a switch button*, not hidden.

## Repo layout

```
apps/token-hub/          the explorer (Next.js 16, wagmi 3, Tailwind 4)
packages/registry-sdk/   ⭐ the typed SDK — pure-viem core + React hooks + 63 tests
packages/fhe-client/     the only @zama-fhe importer: sign-once sessions, FheAdapter
packages/ui/             design system: EncryptedValue, RevealButton, AsyncTxStatus, …
packages/addresses/      verified address book + ABIs (the single source of truth)
scripts/e2e-token-hub.ts the live-Sepolia proof (also the SDK's Node reference consumer)
```

---

Built on [Zama Protocol](https://www.zama.ai) · FHEVM · ERC-7984 · OpenZeppelin confidential-contracts
