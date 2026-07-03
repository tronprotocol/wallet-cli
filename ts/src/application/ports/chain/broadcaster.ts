/**
 * Broadcaster — the single cross-family capability the transaction pipeline relies
 * on. Kept in its own dependency-free file so the concrete clients can implement it and the
 * provider can reference the clients, with no import cycle.
 */
import type { BroadcastResult, SignedTx } from "../../../domain/types/index.js";

export interface Broadcaster {
  broadcast(signed: SignedTx): Promise<BroadcastResult>;
}
