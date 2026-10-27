import { ChainError } from "../../../../domain/errors/index.js";

type Json = Record<string, unknown>;

// Check contract count and type only; this does not verify fields or build origin.
export function assertBuiltTx<T>(tx: T, type: string): T {
  const list = (tx as { raw_data?: Json } | null)?.raw_data?.contract;
  if (!Array.isArray(list) || list.length !== 1 || String((list[0] as Json)?.type ?? "") !== type) {
    throw new ChainError(
      "tx_integrity",
      `locally built transaction is not a single ${type}; refusing to sign`,
    );
  }
  return tx;
}
