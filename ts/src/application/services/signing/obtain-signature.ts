/**
 * obtainSignature — the one place that knows how a signature is *obtained*, as opposed to what is
 * being signed. Callers hand over a signer and what they want signed; the preliminaries are this
 * module's problem.
 *
 * Device signers must be prechecked (is this still the right seed?), announced (`awaiting_device`,
 * so the CLI can print a prompt) and bounded (an un-tapped on-device prompt must not hang the
 * process — aborting closes the transport and rejects the pending APDU). Software signers need
 * none of that and pass straight through.
 *
 * Every signing path funnels through here — transactions (TxPipeline), messages (MessageService),
 * typed data (TypedDataService) — so that per-signer-kind branch exists once, not at four call
 * sites.
 */
import type { Signer, SignerSignOpts } from "../../../domain/types/index.js";
import { withTimeout } from "../../../domain/async/index.js";

/** the slice of TransactionScope this needs; keeps it usable from any scope. */
export interface SigningScope {
  readonly timeoutMs: number;
  emit(event: { type: "awaiting_device"; reason: "sign" }): void;
}

export async function obtainSignature<T>(
  signer: Signer,
  scope: SigningScope,
  produce: (opts: SignerSignOpts) => Promise<T>,
): Promise<T> {
  if (signer.kind !== "device") return produce({});
  await signer.precheck?.();
  scope.emit({ type: "awaiting_device", reason: "sign" });
  const ac = new AbortController();
  return withTimeout(produce({ signal: ac.signal }), scope.timeoutMs, () => ac.abort());
}
