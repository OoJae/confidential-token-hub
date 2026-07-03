"use client";

export { CipherFheProvider, useFheSession, type CipherFheProviderProps } from "./provider.tsx";
export { useReveal, useEncryptU64, useFheAdapter } from "./hooks.ts";

// Re-export the verified react-sdk surface so apps have a single import path
// (and never import @zama-fhe/* directly — see CLAUDE.md).
export {
  useZamaSDK,
  useEncrypt,
  useGrantPermit,
  useHasPermit,
  useDecryptValues,
  useDecryptPublicValues,
  useConfidentialBalance,
  useConfidentialTransfer,
  useShield,
  useUnshield,
  useUnshieldAll,
  useResumeUnshield,
  useUnwrap,
  useFinalizeUnwrap,
  useApproveUnderlying,
  useUnderlyingAllowance,
  useConfidentialSetOperator,
  useConfidentialIsOperator,
  useToken,
  useWrappedToken,
  useMetadata,
  useTotalSupply,
  useWrapperDiscovery,
  useWrappersRegistryAddress,
  useTokenPairsLength,
  useTokenPairsSlice,
  useTokenPair,
  useListPairs,
  useIsConfidentialTokenValid,
  useConfidentialTokenAddress,
  useTokenAddress,
} from "@zama-fhe/react-sdk";
