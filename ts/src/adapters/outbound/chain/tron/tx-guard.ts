/**
 * Built-transaction tripwire — a fail-closed check that every TRON build path stayed local.
 *
 * All builds assemble `raw_data` locally (tronweb `createTransaction`, plus `txLocal` ABI encoding
 * for contract calls); the node only supplies the reference block and later broadcasts, so it
 * cannot substitute transaction content. This is NOT a defense against a hostile node — it is a
 * regression guard: if a future change or a tronweb upgrade re-routes a build through the node or
 * emits an unexpected operation, the type won't match and we refuse to sign instead of proceeding.
 */
import { ChainError } from "../../../../domain/errors/index.js";

type Json = Record<string, unknown>;

/** assert the built tx is exactly one contract of `type`; returns it unchanged. */
export function assertBuiltTx<T>(tx: T, type: string): T {
  const list = (tx as { raw_data?: Json } | null)?.raw_data?.contract;
  if (!Array.isArray(list) || list.length !== 1 || String((list[0] as Json)?.type ?? "") !== type) {
    throw new ChainError("tx_integrity", `locally built transaction is not a single ${type}; refusing to sign`);
  }
  return tx;
}
