import { ChainError } from "../errors/index.js";

/**
 * Race a promise against a deadline. On timeout it rejects with a ChainError("timeout") and
 * runs `onTimeout` (e.g. to abort an in-flight request or a Ledger prompt). The underlying
 * promise keeps running — callers that need true cancellation must wire `onTimeout` to an abort.
 */
export function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new ChainError("timeout", `operation timed out after ${ms}ms`));
    }, ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
