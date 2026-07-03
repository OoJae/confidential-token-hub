import { CHAINS, ZAMA_RELAYER_URL, type ChainId } from "@cipher/addresses";

export interface FheNetworkConfig {
  chainId: ChainId;
  /** Override for the SDK chain preset's relayer URL (testnet v2: relayer.testnet.zama.org). */
  relayerUrl?: string;
  capabilities: {
    /** EIP-712 user decryption available (needs a relayer for this chain). */
    userDecrypt: boolean;
    publicDecrypt: boolean;
    encryptInput: boolean;
  };
}

/**
 * Sepolia is fully enabled; mainnet is read-only for this suite (registry
 * reads only — hooks consult capabilities and surface a clean "unavailable"
 * state instead of a relayer error).
 */
export const FHE_NETWORKS: Record<ChainId, FheNetworkConfig> = {
  [CHAINS.sepolia]: {
    chainId: CHAINS.sepolia,
    relayerUrl: ZAMA_RELAYER_URL[CHAINS.sepolia],
    capabilities: { userDecrypt: true, publicDecrypt: true, encryptInput: true },
  },
  [CHAINS.mainnet]: {
    chainId: CHAINS.mainnet,
    relayerUrl: ZAMA_RELAYER_URL[CHAINS.mainnet],
    // A mainnet relayer exists (relayer.mainnet.zama.org/v2) but this suite
    // keeps mainnet read-only by policy.
    capabilities: { userDecrypt: false, publicDecrypt: false, encryptInput: false },
  },
};

export function requireCapability(
  chainId: number,
  cap: keyof FheNetworkConfig["capabilities"],
): FheNetworkConfig {
  const net = FHE_NETWORKS[chainId as ChainId];
  if (!net?.capabilities[cap]) {
    throw new Error(`FHE capability "${cap}" is not available on chain ${chainId}`);
  }
  return net;
}
