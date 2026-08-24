/**
 * How deep a transaction is buried — the one number `--wait` does not answer.
 *
 * `--wait` stops at the receipt, which is inclusion, not finality. §6.4 leaves "how many
 * confirmations are enough" to the caller and gives them this to judge by, so it is reported
 * identically on every family rather than each computing its own variant.
 */

/**
 * `head - block`, when both are known.
 *
 * The including block is NOT counted, so a transaction just mined reports 0 — §6.4 fixes the
 * arithmetic that way, and it is the reading that makes "0 confirmations" mean what it says.
 *
 * Absent rather than 0 when the head could not be read: "we could not ask" and "nothing has been
 * built on top yet" are different claims, and only the second is about the chain. A negative
 * result (a head read that lags the block, as a load-balanced endpoint can produce) is likewise
 * omitted rather than reported.
 */
export function confirmationsOf(head: unknown, block: unknown): { confirmations?: number } {
  if (head === undefined || head === null || block === undefined || block === null) return {};
  const depth = Number(head) - Number(block);
  return Number.isFinite(depth) && depth >= 0 ? { confirmations: depth } : {};
}
