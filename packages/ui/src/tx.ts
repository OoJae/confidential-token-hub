/**
 * The async transaction state machine every action in the suite renders
 * through <AsyncTxStatus/>. fhe-client and the track SDKs type their flows
 * against this union.
 */
export type TxPhase =
  | "idle"
  | "encrypting"
  | "submitting"
  | "mining"
  | "decrypting"
  | "done"
  | "error";

export const TX_COPY: Record<Exclude<TxPhase, "idle">, string> = {
  encrypting: "Encrypting locally…",
  submitting: "Waiting for wallet confirmation…",
  mining: "Transaction submitted — waiting for confirmation…",
  decrypting: "Decrypting result…",
  done: "Done",
  error: "Failed",
};
