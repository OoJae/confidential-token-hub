/**
 * Error taxonomy for all FHE operations. Every failure that can reach a user
 * is mapped to a FheErrorCode before it leaves this package; @cipher/ui's
 * <ErrorToast/> renders the copy.
 */
export type FheErrorCode =
  | "ACL_DENIED"
  | "SESSION_EXPIRED"
  | "DECRYPTION_PENDING"
  | "APPROVAL_REQUIRED"
  | "INSUFFICIENT_FUNDED"
  | "WRONG_NETWORK"
  | "ROUNDED_TO_ZERO"
  | "SDK_INIT_FAILED"
  | "UNKNOWN";

export class FheError extends Error {
  readonly code: FheErrorCode;
  readonly retryable: boolean;

  constructor(code: FheErrorCode, message?: string, opts?: { retryable?: boolean; cause?: unknown }) {
    super(message ?? code, { cause: opts?.cause });
    this.name = "FheError";
    this.code = code;
    this.retryable = opts?.retryable ?? code === "DECRYPTION_PENDING";
  }
}

/**
 * Best-effort mapping of raw SDK/relayer/wallet errors to the taxonomy.
 * Patterns observed empirically during Gate-0 get recorded in
 * docs/SDK-VERIFICATION.md and folded in here.
 */
export function toFheError(e: unknown): FheError {
  if (e instanceof FheError) return e;

  const msg = extractMessage(e).toLowerCase();

  if (/(not authorized|not allowed|acl|permission denied|unauthorized|403)/.test(msg)) {
    return new FheError("ACL_DENIED", extractMessage(e), { cause: e });
  }
  if (/(signature.*(invalid|expired)|permit.*(invalid|expired|not found)|session expired)/.test(msg)) {
    return new FheError("SESSION_EXPIRED", extractMessage(e), { cause: e });
  }
  if (/(not ready|pending|retry|not yet|unavailable.*decrypt|425|404)/.test(msg)) {
    return new FheError("DECRYPTION_PENDING", extractMessage(e), { retryable: true, cause: e });
  }
  if (/(chain mismatch|wrong network|unsupported chain|does not match the target chain)/.test(msg)) {
    return new FheError("WRONG_NETWORK", extractMessage(e), { cause: e });
  }
  if (/(wasm|webassembly|failed to initialize|tfhe)/.test(msg)) {
    return new FheError("SDK_INIT_FAILED", extractMessage(e), { cause: e });
  }
  return new FheError("UNKNOWN", extractMessage(e), { cause: e });
}

function extractMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
