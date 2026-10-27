import type { BroadcastResult, SignedTx } from "../../../domain/types/index.js";

export interface Broadcaster {
  broadcast(signed: SignedTx): Promise<BroadcastResult>;
}
