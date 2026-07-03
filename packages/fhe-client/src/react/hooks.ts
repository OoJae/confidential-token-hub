"use client";

import { useMemo } from "react";
import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { useZamaSDK } from "@zama-fhe/react-sdk";
import {
  createFheAdapter,
  encryptU64 as coreEncryptU64,
  userDecrypt as coreUserDecrypt,
  type Address,
  type CipherFheAdapter,
  type EncryptedInputResult,
  type Hex,
} from "../core.ts";
import { FheError, toFheError } from "../errors.ts";
import { useFheSession } from "./provider.tsx";

/**
 * Reveal an encrypted euint64 handle: ensures the session permit (one
 * signature the very first time, none afterwards) then user-decrypts.
 * Retries automatically on DECRYPTION_PENDING (fresh handles take a few
 * seconds to become decryptable).
 */
export function useReveal(): UseMutationResult<
  bigint,
  FheError,
  { handle: Hex; contractAddress: Address }
> {
  const sdk = useZamaSDK();
  const { ensureSession } = useFheSession();

  return useMutation({
    mutationFn: async ({ handle, contractAddress }) => {
      try {
        await ensureSession([contractAddress]);
        return await coreUserDecrypt(sdk, { handle, contractAddress });
      } catch (e) {
        throw toFheError(e);
      }
    },
    retry: (failureCount, error) => error.retryable && failureCount < 12,
    retryDelay: (attempt) => Math.min(1500 * 2 ** attempt, 8000),
  });
}

/**
 * The FheAdapter for injection into @cipher/registry-sdk (RegistrySdkProvider)
 * — routes ensureSession through the sign-once session (counter included).
 */
export function useFheAdapter(): CipherFheAdapter {
  const sdk = useZamaSDK();
  const { ensureSession } = useFheSession();
  return useMemo(
    () => ({ ...createFheAdapter(sdk), ensureSession }),
    [sdk, ensureSession],
  );
}

/** Encrypt a uint64 for an externalEuint64 contract parameter. */
export function useEncryptU64(): UseMutationResult<
  EncryptedInputResult,
  FheError,
  { contractAddress: Address; value: bigint }
> {
  const sdk = useZamaSDK();
  const { address } = useAccount();

  return useMutation({
    mutationFn: async ({ contractAddress, value }) => {
      if (!address) throw new FheError("UNKNOWN", "wallet not connected");
      return coreEncryptU64(sdk, { contractAddress, userAddress: address, value });
    },
  });
}
