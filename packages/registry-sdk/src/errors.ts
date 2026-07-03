import { BaseError, ContractFunctionRevertedError, decodeAbiParameters } from "viem";

/**
 * Codes overlap the suite-wide taxonomy (string-identical to @cipher/ui's
 * FheErrorCode — deliberately NOT imported; the core stays dependency-free)
 * plus registry-sdk-specific codes.
 */
export type RegistryErrorCode =
  | "ACL_DENIED"
  | "SESSION_EXPIRED"
  | "DECRYPTION_PENDING"
  | "APPROVAL_REQUIRED"
  | "INSUFFICIENT_FUNDED"
  | "WRONG_NETWORK"
  | "ROUNDED_TO_ZERO"
  | "SDK_INIT_FAILED"
  | "UNKNOWN"
  | "FAUCET_CAP_EXCEEDED"
  | "PAIR_NOT_FOUND"
  | "WRAPPER_REVOKED"
  | "NO_PENDING_REQUEST"
  | "WALLET_REQUIRED"
  | "FHE_ADAPTER_REQUIRED";

export class RegistryError extends Error {
  readonly code: RegistryErrorCode;
  readonly retryable: boolean;
  readonly meta?: Record<string, unknown>;

  constructor(
    code: RegistryErrorCode,
    message?: string,
    opts?: { retryable?: boolean; cause?: unknown; meta?: Record<string, unknown> },
  ) {
    super(message ?? code, { cause: opts?.cause });
    this.name = "RegistryError";
    this.code = code;
    this.retryable = opts?.retryable ?? code === "DECRYPTION_PENDING";
    this.meta = opts?.meta;
  }
}

/** Selector of the mocks' mint-cap custom error (name unknown; matched by selector). */
export const FAUCET_CAP_SELECTOR = "0x3a91f045";

export function toRegistryError(e: unknown): RegistryError {
  if (e instanceof RegistryError) return e;

  // FheError (or anything taxonomy-shaped) passes through with its code.
  if (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    typeof (e as { code: unknown }).code === "string" &&
    TAXONOMY.has((e as { code: string }).code)
  ) {
    const err = e as {
      code: RegistryErrorCode;
      message?: string;
      retryable?: boolean;
      meta?: Record<string, unknown>;
    };
    return new RegistryError(err.code, err.message, {
      retryable: err.retryable,
      cause: e,
      meta: err.meta,
    });
  }

  // viem revert walking — decode known custom-error selectors.
  if (e instanceof BaseError) {
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError) as
      | ContractFunctionRevertedError
      | undefined;
    const raw = revert?.raw;
    if (raw && raw.startsWith(FAUCET_CAP_SELECTOR)) {
      try {
        const [requested, cap] = decodeAbiParameters(
          [{ type: "uint256" }, { type: "uint256" }],
          `0x${raw.slice(10)}`,
        );
        return new RegistryError("FAUCET_CAP_EXCEEDED", `mint cap exceeded (${requested} > ${cap})`, {
          cause: e,
          meta: { requested, cap },
        });
      } catch {
        return new RegistryError("FAUCET_CAP_EXCEEDED", "mint cap exceeded", { cause: e });
      }
    }
  }

  const msg = e instanceof Error ? e.message : String(e);
  if (/(chain mismatch|wrong network|unsupported chain|does not match)/i.test(msg)) {
    return new RegistryError("WRONG_NETWORK", msg, { cause: e });
  }
  return new RegistryError("UNKNOWN", msg, { cause: e });
}

const TAXONOMY = new Set<string>([
  "ACL_DENIED",
  "SESSION_EXPIRED",
  "DECRYPTION_PENDING",
  "APPROVAL_REQUIRED",
  "INSUFFICIENT_FUNDED",
  "WRONG_NETWORK",
  "ROUNDED_TO_ZERO",
  "SDK_INIT_FAILED",
  "UNKNOWN",
  "FAUCET_CAP_EXCEEDED",
  "PAIR_NOT_FOUND",
  "WRAPPER_REVOKED",
  "NO_PENDING_REQUEST",
  "WALLET_REQUIRED",
  "FHE_ADAPTER_REQUIRED",
]);
