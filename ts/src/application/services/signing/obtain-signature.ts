// Check device identity before signing; abort a timed-out signature to cancel the device prompt.
import type { Signer, SignerSignOpts } from "../../../domain/types/index.js";
import { withTimeout } from "../../../domain/async/index.js";

export interface SigningScope {
  readonly timeoutMs: number;
  emit(event: { type: "awaiting_device"; reason: "sign" }): void;
  warn?(message: string): void;
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
  return withTimeout(
    produce({
      signal: ac.signal,
      ...(scope.warn ? { onWarning: (message: string) => scope.warn!(message) } : {}),
    }),
    scope.timeoutMs,
    () => ac.abort(),
  );
}
