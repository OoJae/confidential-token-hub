/**
 * Node-side FHE client for scripts (Gate-0 proof, E2E tests, seeding).
 * Uses @zama-fhe/sdk's node() relayer: local WASM from the installed
 * relayer-sdk, real HTTPS relayer per the chain preset. Node >= 22, ESM.
 * Do NOT bundle files importing this (the SDK worker resolves via
 * import.meta.resolve).
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { sepolia as sepoliaViem } from "viem/chains";
import { ZamaSDK } from "@zama-fhe/sdk";
import { createConfig } from "@zama-fhe/sdk/viem";
import { sepolia as sepoliaFhe } from "@zama-fhe/sdk/chains";
import { node } from "@zama-fhe/sdk/node";
import type { Address, Hex } from "./core.ts";

export interface NodeFheClient {
  sdk: ZamaSDK;
  account: PrivateKeyAccount;
  address: Address;
  publicClient: PublicClient;
  walletClient: WalletClient;
  /** EIP-712 typed-data signatures collected so far (the sign-once meter). */
  signCount: () => number;
  /** Terminate the SDK worker pool — REQUIRED or the process hangs. */
  dispose: () => void;
}

export function createNodeFheClient(params: {
  rpcUrl: string;
  privateKey: Hex;
  relayerUrl?: string;
}): NodeFheClient {
  const base = privateKeyToAccount(params.privateKey);

  // Count EIP-712 prompts at the single choke point: the local account.
  // (walletClient.signTypedData delegates here for local accounts — wrapping
  // both would double-count.)
  let signCount = 0;
  const countingSignTypedData = (async (args: unknown) => {
    signCount += 1;
    return (base.signTypedData as (a: unknown) => Promise<Hex>)(args);
  }) as PrivateKeyAccount["signTypedData"];
  const account: PrivateKeyAccount = { ...base, signTypedData: countingSignTypedData };

  const publicClient = createPublicClient({ chain: sepoliaViem, transport: http(params.rpcUrl) });
  const walletClient = createWalletClient({
    account,
    chain: sepoliaViem,
    transport: http(params.rpcUrl),
  });

  const chain = {
    ...sepoliaFhe,
    network: params.rpcUrl,
    ...(params.relayerUrl ? { relayerUrl: params.relayerUrl } : {}),
  } as const;

  const config = createConfig({
    chains: [chain],
    relayers: { [chain.id]: node() },
    publicClient,
    walletClient,
  });
  const sdk = new ZamaSDK(config);

  return {
    sdk,
    account,
    address: base.address,
    publicClient,
    walletClient,
    signCount: () => signCount,
    dispose: () => sdk.terminate(),
  };
}
