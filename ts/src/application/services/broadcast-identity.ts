/**
 * Which transaction id to believe after a broadcast.
 *
 * A TRON txID is the sha256 of the transaction body: not an identifier the node assigns, but one
 * derivable from the bytes we signed — and we derive it. The broadcast reply carries the node's own
 * copy, and it is the same value whenever the node is honest (verified against a live Nile node).
 * Taking it on trust anyway means a node whose copy is wrong chooses which transaction we then poll
 * for with `--wait` and quote back to the caller, which is how a receipt ends up describing someone
 * else's successful transaction.
 *
 * So the locally derived id wins where we have one. Disagreement is surfaced rather than thrown on:
 * the transaction has already been broadcast, and failing a submitted transaction would repeat the
 * mistake of reporting a side effect that happened as if it had not.
 */
export function authoritativeTxId(
  local: string | undefined,
  reported: string | undefined,
  warn: (message: string) => void,
): string {
  const nodeId = reported ?? "";
  if (!local) return nodeId;
  // Compared case-insensitively: hex case carries no meaning, and comparing the representation
  // rather than the value is what made a valid keystore look like a wrong password (CR-033).
  if (nodeId && nodeId.toLowerCase() !== local.toLowerCase()) {
    warn(
      `the node reported transaction id ${nodeId} for a transaction whose id is ${local}; ` +
        "using the id derived from the signed transaction. The node is misreporting or faulty",
    );
  }
  return local;
}

/** best-effort transaction id of a signed tx, derived from its own bytes (TRON: txID). */
export function localTxId(signed: unknown): string | undefined {
  const s = signed as { txID?: unknown; hash?: unknown } | null;
  const id = s?.txID ?? s?.hash;
  return typeof id === "string" && id !== "" ? id : undefined;
}
