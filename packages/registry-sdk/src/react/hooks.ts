"use client";

import { useCallback, useMemo, useReducer } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { RegistryError, toRegistryError } from "../errors.ts";
import { listPairs, type TokenWrapperPair } from "../registry.ts";
import { getBalanceHandle, getIsOperator, getWrapperMeta, type WrapperMeta } from "../wrapper-reads.ts";
import { wrap, type WrapParams, type WrapResult } from "../wrap.ts";
import { faucetMint } from "../faucet.ts";
import { confidentialTransfer } from "../transfer.ts";
import { revokeOperator, setOperator } from "../operator.ts";
import { getPendingUnwraps, type PendingUnwrap } from "../unwrap/detect.ts";
import { unwrapFinalize, unwrapStart } from "../unwrap/machine.ts";
import { createUnwrapStore, defaultKV } from "../unwrap/store.ts";
import { ZERO_HANDLE } from "../constants.ts";
import { registryKeys } from "./keys.ts";
import { useRegistrySdkContext } from "./provider.tsx";
import type { Address, ChainId, FheAdapter, Hex, ReadCtx, TxResult, WriteCtx } from "../types.ts";

/** Resolve a ReadCtx from wagmi for an EXPLICIT chainId (multi-chain safe). */
function useReadCtx(chainId: ChainId): ReadCtx | undefined {
  const publicClient = usePublicClient({ chainId });
  return useMemo(
    () => (publicClient ? { chainId, publicClient } : undefined),
    [chainId, publicClient],
  );
}

function useWriteCtx(chainId: ChainId): (() => WriteCtx) {
  const ctx = useReadCtx(chainId);
  const { data: walletClient } = useWalletClient();
  return useCallback(() => {
    if (!ctx) throw new RegistryError("UNKNOWN", "public client unavailable");
    if (!walletClient) throw new RegistryError("WALLET_REQUIRED", "connect a wallet first");
    if (walletClient.chain && walletClient.chain.id !== chainId) {
      throw new RegistryError(
        "WRONG_NETWORK",
        `wallet is on chain ${walletClient.chain.id}, action targets ${chainId}`,
      );
    }
    return { ...ctx, walletClient };
  }, [ctx, walletClient, chainId]);
}

function useFhe(): FheAdapter {
  const { fhe } = useRegistrySdkContext();
  if (!fhe) {
    throw new RegistryError(
      "FHE_ADAPTER_REQUIRED",
      "wrap a RegistrySdkProvider with the fhe prop (useFheAdapter from @cipher/fhe-client/react)",
    );
  }
  return fhe;
}

// ── reads ────────────────────────────────────────────────────────────────

export function usePairs(p: { chainId: ChainId }): UseQueryResult<TokenWrapperPair[], RegistryError> {
  const ctx = useReadCtx(p.chainId);
  return useQuery({
    queryKey: registryKeys.pairs(p.chainId),
    queryFn: () => listPairs(ctx!),
    enabled: !!ctx,
    staleTime: 60_000,
  });
}

export function useWrapperMeta(p: {
  chainId: ChainId;
  wrapper?: Address;
}): UseQueryResult<WrapperMeta, RegistryError> {
  const ctx = useReadCtx(p.chainId);
  return useQuery({
    queryKey: registryKeys.meta(p.chainId, p.wrapper ?? "0x"),
    queryFn: () => getWrapperMeta(ctx!, p.wrapper!),
    enabled: !!ctx && !!p.wrapper,
    staleTime: 30_000,
  });
}

export function useBalanceHandle(p: {
  chainId: ChainId;
  wrapper: Address;
  account?: Address;
}): UseQueryResult<Hex, RegistryError> {
  const ctx = useReadCtx(p.chainId);
  return useQuery({
    queryKey: registryKeys.balanceHandle(p.chainId, p.wrapper, p.account ?? "0x"),
    queryFn: () => getBalanceHandle(ctx!, p.wrapper, p.account!),
    enabled: !!ctx && !!p.account,
    staleTime: 15_000,
  });
}

export type DecryptedBalanceStatus =
  | "no-wallet"
  | "undisclosed"
  | "revealing"
  | "revealed"
  | "error";

/**
 * Reveal-on-demand balance. Revealed cleartext is cached PER HANDLE — a
 * balance change produces a new handle and therefore re-locks the row (FHE
 * rule 4 by construction). Requires the RegistrySdkProvider fhe adapter.
 */
export function useDecryptedBalance(p: {
  chainId: ChainId;
  wrapper: Address;
  account?: Address;
}): {
  handle: Hex | undefined;
  status: DecryptedBalanceStatus;
  value: bigint | undefined;
  uninitialized: boolean;
  reveal: () => void;
  error: RegistryError | null;
} {
  const { fhe } = useRegistrySdkContext();
  const queryClient = useQueryClient();
  const { data: handle } = useBalanceHandle(p);

  const revealedKey = handle
    ? registryKeys.revealed(p.chainId, p.wrapper, handle)
    : (["registry", p.chainId, "revealed", p.wrapper, "none"] as const);
  const revealed = useQuery<bigint>({
    queryKey: revealedKey,
    enabled: false, // populated only via reveal()
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: () => Promise.reject(new Error("reveal() populates this key")),
  });

  const mutation = useMutation<bigint, RegistryError>({
    mutationFn: async () => {
      if (!fhe) throw new RegistryError("FHE_ADAPTER_REQUIRED", "no FheAdapter in context");
      if (!handle || handle === ZERO_HANDLE) {
        throw new RegistryError("UNKNOWN", "nothing to reveal");
      }
      try {
        await fhe.ensureSession?.([p.wrapper]);
        return await fhe.userDecrypt({ handle, contractAddress: p.wrapper });
      } catch (e) {
        throw toRegistryError(e);
      }
    },
    retry: (count, err) => err.retryable && count < 12,
    retryDelay: (attempt) => Math.min(1500 * 2 ** attempt, 8000),
    onSuccess: (value) => queryClient.setQueryData(revealedKey, value),
  });

  const uninitialized = handle === ZERO_HANDLE;
  const status: DecryptedBalanceStatus = !p.account
    ? "no-wallet"
    : mutation.isPending
      ? "revealing"
      : revealed.data !== undefined
        ? "revealed"
        : mutation.isError
          ? "error"
          : "undisclosed";

  return {
    handle,
    status,
    value: revealed.data,
    uninitialized,
    reveal: () => mutation.mutate(),
    error: mutation.error ?? null,
  };
}

// ── mutations ────────────────────────────────────────────────────────────

export function useWrap(p: {
  chainId: ChainId;
  wrapper: Address;
}): UseMutationResult<WrapResult, RegistryError, Omit<WrapParams, "wrapper">> {
  const writeCtx = useWriteCtx(p.chainId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params) => wrap(writeCtx(), { ...params, wrapper: p.wrapper }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["registry", p.chainId] });
    },
  });
}

export function useFaucetMint(p: {
  chainId: ChainId;
}): UseMutationResult<TxResult, RegistryError, { underlying: Address; amount: bigint; to?: Address }> {
  const writeCtx = useWriteCtx(p.chainId);
  return useMutation({ mutationFn: (params) => faucetMint(writeCtx(), params) });
}

export function useConfidentialTransfer(p: {
  chainId: ChainId;
  wrapper: Address;
}): UseMutationResult<
  TxResult & { amountHandle: Hex | null },
  RegistryError,
  { to: Address; amount: bigint }
> {
  const writeCtx = useWriteCtx(p.chainId);
  const fheCtx = useRegistrySdkContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params) => {
      if (!fheCtx.fhe) throw new RegistryError("FHE_ADAPTER_REQUIRED", "no FheAdapter in context");
      return confidentialTransfer({ ...writeCtx(), fhe: fheCtx.fhe }, { ...params, wrapper: p.wrapper });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["registry", p.chainId] }),
  });
}

export function useOperator(p: { chainId: ChainId; wrapper: Address; holder?: Address; spender?: Address }) {
  const ctx = useReadCtx(p.chainId);
  const writeCtx = useWriteCtx(p.chainId);
  const queryClient = useQueryClient();

  const isOperator = useQuery({
    queryKey: registryKeys.isOperator(p.chainId, p.wrapper, p.holder ?? "0x", p.spender ?? "0x"),
    queryFn: () => getIsOperator(ctx!, p.wrapper, p.holder!, p.spender!),
    enabled: !!ctx && !!p.holder && !!p.spender,
    staleTime: 30_000,
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({
      queryKey: ["registry", p.chainId, "isOperator", p.wrapper],
    });

  const set = useMutation<TxResult, RegistryError, { operator: Address; until: number }>({
    mutationFn: (params) => setOperator(writeCtx(), { ...params, wrapper: p.wrapper }),
    onSuccess: invalidate,
  });
  const revoke = useMutation<TxResult, RegistryError, { operator: Address }>({
    mutationFn: (params) => revokeOperator(writeCtx(), { ...params, wrapper: p.wrapper }),
    onSuccess: invalidate,
  });

  return { isOperator, set, revoke };
}

// ── unwrap machine ───────────────────────────────────────────────────────

export type UnwrapPhase = "idle" | "requesting" | "requested" | "finalizing" | "done" | "error";

interface UnwrapState {
  phase: UnwrapPhase;
  requestId?: Hex;
  requestTxHash?: Hex;
  finalizeTxHash?: Hex;
  cleartext?: bigint;
  error: RegistryError | null;
}

type UnwrapAction =
  | { type: "requesting" }
  | { type: "requested"; requestId: Hex; requestTxHash: Hex }
  | { type: "resume"; requestId: Hex }
  | { type: "finalizing" }
  | { type: "done"; cleartext: bigint; finalizeTxHash: Hex }
  | { type: "error"; error: RegistryError; keepPhase?: UnwrapPhase }
  | { type: "reset" };

function unwrapReducer(state: UnwrapState, action: UnwrapAction): UnwrapState {
  switch (action.type) {
    case "requesting":
      return { phase: "requesting", error: null };
    case "requested":
      return {
        phase: "requested",
        requestId: action.requestId,
        requestTxHash: action.requestTxHash,
        error: null,
      };
    case "resume":
      return { phase: "requested", requestId: action.requestId, error: null };
    case "finalizing":
      return { ...state, phase: "finalizing", error: null };
    case "done":
      return {
        ...state,
        phase: "done",
        cleartext: action.cleartext,
        finalizeTxHash: action.finalizeTxHash,
        error: null,
      };
    case "error":
      return { ...state, phase: action.keepPhase ?? "error", error: action.error };
    case "reset":
      return { phase: "idle", error: null };
  }
}

/**
 * The two-step async unwrap as a UI state machine. Every transition mirrors
 * to the persistent store, so a refresh at ANY phase lands back at
 * "requested" — resumable from usePendingUnwraps.
 */
export function useUnwrap(p: { chainId: ChainId; wrapper: Address; autoFinalize?: boolean }) {
  const writeCtx = useWriteCtx(p.chainId);
  const fhe = useRegistrySdkContext().fhe;
  const storage = useRegistrySdkContext().storage;
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(unwrapReducer, { phase: "idle", error: null });

  const store = useMemo(
    () =>
      address ? createUnwrapStore(storage ?? defaultKV(), p.chainId, address as Address) : undefined,
    [storage, p.chainId, address],
  );

  const finalize = useCallback(
    async (requestId?: Hex) => {
      const id = requestId ?? state.requestId;
      if (!id) throw new RegistryError("NO_PENDING_REQUEST", "no requestId to finalize");
      if (!fhe) throw new RegistryError("FHE_ADAPTER_REQUIRED", "no FheAdapter in context");
      dispatch({ type: "finalizing" });
      try {
        const res = await unwrapFinalize(
          { ...writeCtx(), fhe, store },
          { wrapper: p.wrapper, requestId: id },
        );
        dispatch({ type: "done", cleartext: res.cleartext, finalizeTxHash: res.txHash });
        void queryClient.invalidateQueries({ queryKey: ["registry", p.chainId] });
      } catch (e) {
        // Stay resumable: error is surfaced but the phase returns to "requested".
        dispatch({ type: "error", error: toRegistryError(e), keepPhase: "requested" });
        throw e;
      }
    },
    [state.requestId, fhe, writeCtx, store, p.wrapper, p.chainId, queryClient],
  );

  const start = useCallback(
    async (v: { amount: bigint; to?: Address }) => {
      if (!fhe) throw new RegistryError("FHE_ADAPTER_REQUIRED", "no FheAdapter in context");
      dispatch({ type: "requesting" });
      try {
        const res = await unwrapStart(
          { ...writeCtx(), fhe, store },
          { wrapper: p.wrapper, amount: v.amount, to: v.to },
        );
        dispatch({ type: "requested", requestId: res.requestId, requestTxHash: res.txHash });
        void queryClient.invalidateQueries({ queryKey: ["registry", p.chainId] });
        if (p.autoFinalize ?? true) await finalize(res.requestId);
      } catch (e) {
        const err = toRegistryError(e);
        if (state.phase === "requesting" || err.code !== "NO_PENDING_REQUEST") {
          dispatch({ type: "error", error: err });
        }
        throw e;
      }
    },
    [fhe, writeCtx, store, p.wrapper, p.autoFinalize, p.chainId, finalize, queryClient, state.phase],
  );

  const resume = useCallback((requestId: Hex) => dispatch({ type: "resume", requestId }), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  return { ...state, start, finalize, resume, reset };
}

export function usePendingUnwraps(p: {
  chainId: ChainId;
  account?: Address;
  wrappers?: Address[];
  depth?: "recent" | "full";
}): UseQueryResult<PendingUnwrap[], RegistryError> {
  const ctx = useReadCtx(p.chainId);
  const { storage } = useRegistrySdkContext();
  return useQuery({
    queryKey: [...registryKeys.pendingUnwraps(p.chainId, p.account ?? "0x"), p.depth ?? "recent"],
    queryFn: async () => {
      const store = createUnwrapStore(storage ?? defaultKV(), p.chainId, p.account!);
      const wrappers = p.wrappers ?? (await listPairs(ctx!)).map((pair) => pair.wrapper);
      return getPendingUnwraps(
        { ...ctx!, store },
        { account: p.account!, wrappers, depth: p.depth },
      );
    },
    enabled: !!ctx && !!p.account,
    staleTime: 30_000,
  });
}
