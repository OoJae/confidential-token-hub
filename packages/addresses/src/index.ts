/**
 * @cipher/addresses — the single source of truth for every on-chain address the
 * suite touches. Nothing outside this package may hard-code an address.
 *
 * All values verified on-chain + against docs.zama.org on 2026-07-03.
 */

export type Address = `0x${string}`;

export const CHAINS = { sepolia: 11155111, mainnet: 1 } as const;
export type ChainId = (typeof CHAINS)[keyof typeof CHAINS];

/** Confidential Token Wrappers Registry (Protocol-DAO-owned). */
export const REGISTRY = {
  [CHAINS.sepolia]: "0x2f0750Bbb0A246059d80e94c454586a7F27a128e",
  [CHAINS.mainnet]: "0xeb5015fF021DB115aCe010f23F55C2591059bBA0",
} as const satisfies Record<ChainId, Address>;

export const EXPLORERS = {
  [CHAINS.sepolia]: "https://sepolia.etherscan.io",
  [CHAINS.mainnet]: "https://etherscan.io",
} as const satisfies Record<ChainId, string>;

/**
 * Zama v2 relayers (migrated 2026 — relayer.testnet.zama.cloud is STALE).
 * The /v2 path suffix is REQUIRED. The @zama-fhe/sdk chain presets embed
 * these; exported for overrides/scripts only.
 */
export const ZAMA_RELAYER_URL = {
  [CHAINS.sepolia]: "https://relayer.testnet.zama.org/v2",
  [CHAINS.mainnet]: "https://relayer.mainnet.zama.org/v2",
} as const;

export interface MockPair {
  readonly symbol: string;
  readonly name: string;
  readonly wrapper: Address;
  readonly underlying: Address;
  /**
   * Decimals verified on-chain. The entries still marked `verified: false`
   * MUST be filled from packages/contracts-common `read:registry` output
   * before anything (faucet, wrap forms) depends on them.
   */
  readonly underlyingDecimals: number;
  readonly wrapperDecimals: number;
  /** wrapper.rate() = 10^(underlyingDecimals - wrapperDecimals). */
  readonly rate: bigint;
  readonly verified: boolean;
}

export const SEPOLIA_MOCKS: readonly MockPair[] = [
  {
    symbol: "cUSDCMock",
    name: "Confidential USDC (Mock)",
    wrapper: "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639",
    underlying: "0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF",
    underlyingDecimals: 6,
    wrapperDecimals: 6,
    rate: 1n,
    verified: true,
  },
  {
    symbol: "cUSDTMock",
    name: "Confidential Tether USD (Mock)",
    wrapper: "0x4E7B06D78965594eB5EF5414c357ca21E1554491",
    underlying: "0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0",
    underlyingDecimals: 6,
    wrapperDecimals: 6,
    rate: 1n,
    verified: true,
  },
  {
    symbol: "cWETHMock",
    name: "Confidential Wrapped Ether (Mock)",
    wrapper: "0x46208622DA27d91db4f0393733C8BA082ed83158",
    underlying: "0xff54739b16576FA5402F211D0b938469Ab9A5f3F",
    underlyingDecimals: 18,
    wrapperDecimals: 6,
    rate: 10n ** 12n,
    verified: true,
  },
  {
    symbol: "cBRONMock",
    name: "Confidential BRON (Mock)",
    wrapper: "0xaa5612FA27c927a0c7961f5AEFEE5ba3A0F9C891",
    underlying: "0xFf021fB13cA64e5354c62c954b949a88cfDEb25E",
    underlyingDecimals: 18,
    wrapperDecimals: 6,
    rate: 10n ** 12n,
    verified: true,
  },
  {
    symbol: "cZAMAMock",
    name: "Confidential ZAMA (Mock)",
    wrapper: "0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB",
    underlying: "0x75355a85c6FB9df5f0C80FF54e8747EEe9a0BF57",
    underlyingDecimals: 18,
    wrapperDecimals: 6,
    rate: 10n ** 12n,
    verified: true,
  },
  {
    symbol: "ctGBPMock",
    name: "Confidential tGBP (Mock)",
    wrapper: "0xfCE5c7069c5525eF6c8C2b2E35A745bA20a2F7CC",
    underlying: "0x93c931278A2aad1916783F952f94276eA5111442",
    underlyingDecimals: 18,
    wrapperDecimals: 6,
    rate: 10n ** 12n,
    verified: true,
  },
  {
    symbol: "cXAUtMock",
    name: "Confidential XAUt (Mock)",
    wrapper: "0xe4FcF848739845BC81Dee1d5352cf3844F0a60C7",
    underlying: "0x24377AE4AA0C45ecEe71225007f17c5D423dd940",
    underlyingDecimals: 6,
    wrapperDecimals: 6,
    rate: 1n,
    verified: true,
  },
];

/** Mainnet confidential wrappers (read-only in this suite). */
export const MAINNET_TOKENS = {
  cUSDC: "0xe978F22157048E5DB8E5d07971376e86671672B2",
  cUSDT: "0xAe0207C757Aa2B4019Ad96edD0092ddc63EF0c50",
  cWETH: "0xda9396b82634Ea99243cE51258B6A5Ae512D4893",
  cZAMA: "0x80CB147Fd86dC6dEe3Eee7e4Cee33d1397d98071",
} as const satisfies Record<string, Address>;

/**
 * Mock underlyings expose a public mint(address,uint256).
 * Cap: 1,000,000 WHOLE tokens per call; the uint256 argument is in BASE units
 * (verified by boundary eth_call: 1e12 passes, 1e12+1 reverts for 6-dec USDCMock).
 * Exceeding reverts with custom error 0x3a91f045(requested, cap).
 */
export const MINT_CAP_WHOLE = 1_000_000n;

export const toBaseUnits = (whole: bigint, decimals: number): bigint =>
  whole * 10n ** BigInt(decimals);

/** ERC-7984 interface id (ERC-165). */
export const ERC7984_INTERFACE_ID = "0x4958f2a4" as const;
