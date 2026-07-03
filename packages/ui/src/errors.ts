/**
 * The cross-app error taxonomy. Every failure in the suite maps to one of
 * these codes before it reaches the user (rendered via <ErrorToast/>).
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
  | "FAUCET_CAP_EXCEEDED"
  | "PAIR_NOT_FOUND"
  | "WRAPPER_REVOKED"
  | "NO_PENDING_REQUEST"
  | "WALLET_REQUIRED"
  | "FHE_ADAPTER_REQUIRED"
  | "UNKNOWN";

export const ERROR_COPY: Record<FheErrorCode, { title: string; body: string }> = {
  ACL_DENIED: {
    title: "Not allowed to decrypt",
    body: "Your address doesn't have permission to reveal this value. If you just received it, wait for the transaction to confirm and try again.",
  },
  SESSION_EXPIRED: {
    title: "Decryption session expired",
    body: "Your reveal session timed out. Sign once to start a new session — reveals stay instant afterwards.",
  },
  DECRYPTION_PENDING: {
    title: "Decryption in progress",
    body: "The network is still preparing this value. This usually takes a few seconds — we'll keep retrying.",
  },
  APPROVAL_REQUIRED: {
    title: "Approval needed",
    body: "The wrapper needs a one-time token approval before it can wrap. Approve, then wrap.",
  },
  INSUFFICIENT_FUNDED: {
    title: "Not funded yet",
    body: "This airdrop hasn't been funded by the issuer. Claiming now would transfer nothing — check back soon.",
  },
  WRONG_NETWORK: {
    title: "Wrong network",
    body: "Your wallet is on a different network. Switch to continue.",
  },
  ROUNDED_TO_ZERO: {
    title: "Amount too small",
    body: "This amount is below the wrapper's conversion rate and would wrap to zero. Enter a larger amount.",
  },
  SDK_INIT_FAILED: {
    title: "Encryption engine failed to load",
    body: "The FHE client couldn't initialize. Refresh the page; if it persists, check your connection.",
  },
  FAUCET_CAP_EXCEEDED: {
    title: "Over the faucet cap",
    body: "Mock tokens mint at most 1,000,000 whole tokens per call. Lower the amount and try again.",
  },
  PAIR_NOT_FOUND: {
    title: "Not in the registry",
    body: "This address isn't a registered confidential-token pair on the selected network.",
  },
  WRAPPER_REVOKED: {
    title: "Wrapper revoked",
    body: "This wrapper was revoked by the Protocol DAO. Wrapping is disabled — existing balances can still be unwrapped.",
  },
  NO_PENDING_REQUEST: {
    title: "Nothing to finalize",
    body: "This unwrap request is unknown or was already finalized.",
  },
  WALLET_REQUIRED: {
    title: "Wallet needed",
    body: "Connect a wallet to perform this action.",
  },
  FHE_ADAPTER_REQUIRED: {
    title: "Decryption unavailable",
    body: "This network or context has no FHE decryption configured.",
  },
  UNKNOWN: {
    title: "Something went wrong",
    body: "An unexpected error occurred. Try again — if it persists, check the console for details.",
  },
};
