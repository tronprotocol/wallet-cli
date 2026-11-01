import type { DispatchCheck } from "../../contracts/deadline.js";
import type { BroadcastResult, SignedTx } from "../../../domain/types/index.js";

export interface Broadcaster {
  // `check` is the submit check; it runs again right before the transaction is sent.
  broadcast(signed: SignedTx, check: DispatchCheck): Promise<BroadcastResult>;
}
