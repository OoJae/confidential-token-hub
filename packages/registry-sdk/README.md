# @cipher/registry-sdk

Typed SDK for the [Zama Confidential Token Wrappers Registry](https://docs.zama.org/protocol/protocol-apps/confidential-tokens/wrapper-registry) and its ERC-7984 wrappers.

**Pure-viem core** — read-only consumers install no WASM, no relayer client, no `@zama-fhe/*` packages. FHE operations (balance decryption, unwrap, confidential transfer) plug in through a 3-method `FheAdapter` you inject.

```
pnpm add @cipher/registry-sdk viem
```

## Quickstart — the registry in 10 lines

```ts
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { createRegistrySdk } from "@cipher/registry-sdk";

const sdk = createRegistrySdk({
  chainId: sepolia.id,
  publicClient: createPublicClient({ chain: sepolia, transport: http() }),
});
const pairs = await sdk.listPairs();                      // every pair — revoked ones included
console.log(await sdk.getWrapperMeta(pairs[0].wrapper));  // { symbol, rate, tvs, maxSupply, isValid, … }
```

## Add a wallet (wrap + faucet)

```ts
const sdk = createRegistrySdk({ chainId, publicClient, walletClient });
await sdk.faucetMint({ underlying, amount: 1_000_000_000n });      // cap-aware (1M whole tokens/call)
const res = await sdk.wrap({ wrapper, amount: 100_000_000n });     // approve → wrap composite
// res: { minted, pulled, remainder, rate, txHash, approveTxHash? }
// remainder = amount % rate — it never left your wallet (no refund transfer happens).
```

`wrap` throws `ROUNDED_TO_ZERO` **before spending any gas** when `amount < rate()`, and refuses revoked wrappers with `WRAPPER_REVOKED`.

## Add FHE — inject the adapter

```ts
import { createFheAdapter } from "@cipher/fhe-client";   // or hand-roll the 3-method interface

const sdk = createRegistrySdk({ chainId, publicClient, walletClient, fhe: createFheAdapter(zamaSdk) });

await sdk.decryptBalance(wrapper, account);              // EIP-712 user-decryption, sign-once
const { requestId } = await sdk.unwrapStart({ wrapper, amount: 20_000_000n });
await sdk.unwrapFinalize({ wrapper, requestId });        // publicDecrypt + finalizeUnwrap
```

The adapter interface (implement it against any Zama SDK instance, or mock it in tests):

```ts
interface FheAdapter {
  encryptU64(p): Promise<{ handle, inputProof }>;
  userDecrypt(p): Promise<bigint>;
  publicDecrypt(handles): Promise<{ clearValues, decryptionProof }>;
  ensureSession?(contracts): Promise<void>;   // sign-once permit management
}
```

## The two-step unwrap lifecycle

```
unwrapStart()                      unwrapFinalize()
 encrypt → unwrap tx → parse       unwrapRequester(id) guard → publicDecrypt([id])
 UnwrapRequested → PERSIST    →    (the requestId IS the burned-amount handle)
 status: "requested"               → finalizeUnwrap(id, cleartext, proof) → "finalized"
```

- Records persist to storage **before** `unwrapStart` returns — a refresh at any point resumes.
- `pendingUnwraps({ account })` unions the local store with a receiver-filtered
  `UnwrapRequested` log scan (chunked + adaptive for public-RPC limits), then verifies every
  candidate against the on-chain oracle `unwrapRequester(id)`.
- **Multiple concurrent pending unwraps per wrapper are native** — records are keyed by
  requestId. (The official `@zama-fhe/sdk` pending store holds one per wrapper.)
- `unwrapFinalize` is idempotent to retry: a failed finalize reverts the record to `"requested"`.

## React hooks (`@cipher/registry-sdk/react`)

Every hook takes an **explicit `chainId`** and resolves clients from wagmi — mainnet registry
reads and Sepolia actions render in the same tree (provider-bound hooks can't do this).

```tsx
import { RegistrySdkProvider, usePairs, useWrapperMeta, useDecryptedBalance, useWrap, useUnwrap } from "@cipher/registry-sdk/react";
import { useFheAdapter } from "@cipher/fhe-client/react";

function Providers({ children }) {
  const fhe = useFheAdapter();   // inside CipherFheProvider
  return <RegistrySdkProvider fhe={fhe}>{children}</RegistrySdkProvider>;
}

const { data: pairs } = usePairs({ chainId: 11155111 });
const balance = useDecryptedBalance({ chainId, wrapper, account });
// balance.status: "undisclosed" | "revealing" | "revealed" — a revealed value is cached
// PER HANDLE, so a balance change re-locks the row automatically (never renders a stale 0).
```

Read hooks (`usePairs`, `useWrapperMeta`, `useBalanceHandle`) need no provider at all.

## Error taxonomy

Every failure maps to a `RegistryError` with a stable `code` (rendered by `@cipher/ui`'s
`<ErrorToast/>`): `ACL_DENIED · SESSION_EXPIRED · DECRYPTION_PENDING (retryable) ·
APPROVAL_REQUIRED · WRONG_NETWORK · ROUNDED_TO_ZERO · FAUCET_CAP_EXCEEDED · PAIR_NOT_FOUND ·
WRAPPER_REVOKED · NO_PENDING_REQUEST · WALLET_REQUIRED · FHE_ADAPTER_REQUIRED · UNKNOWN`.

## Design notes

- **Zero WASM for reads**: the core's only dependency is `@cipher/addresses` (typed address book
  + verified ABIs). Adding a chain = one address-book entry.
- Registry enumeration is always **paginated via slices** and race-safe against the registry
  growing/shrinking mid-pagination. Revoked pairs (`isValid: false`) are returned, never hidden.
- `getWrapperMeta` degrades field-by-field on anomalous wrappers/underlyings instead of throwing.
- Structural client types (`MinimalPublicClient`/`MinimalWalletClient`) — tests stub them in
  three lines; `pnpm test` never touches the network.

## Testing

```
pnpm --filter @cipher/registry-sdk test   # vitest, fully offline
```
