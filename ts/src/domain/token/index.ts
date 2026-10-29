import type { ChainFamily, TokenEntry, TokensFile } from "../types/index.js";
import { CliError, ExecutionError, UsageError } from "../errors/index.js";
import { addressCodec } from "../family/index.js";
import { checkedTokenDecimals } from "../amounts/index.js";

const CONTRACT_FAMILY: Record<Exclude<TokenEntry["kind"], "trc10">, ChainFamily> = {
  trc20: "tron",
  erc20: "evm",
};
const TOKEN_KINDS = ["trc20", "trc10", "erc20"] as const;

// Token ids are compared and stored in this form.
export function canonicalTokenId(kind: TokenEntry["kind"], id: string): string {
  if (kind === "trc10") {
    if (!/^\d+$/.test(id)) {
      throw new UsageError("invalid_value", `TRC10 asset id must be numeric: ${id}`);
    }
    return id;
  }
  const codec = addressCodec(CONTRACT_FAMILY[kind]);
  if (!codec.validate(id)) {
    throw new UsageError("invalid_address", `not a valid ${CONTRACT_FAMILY[kind]} contract: ${id}`);
  }
  return codec.canonical(id);
}

export function tokenEntry(entry: TokenEntry): TokenEntry {
  if (!TOKEN_KINDS.includes(entry.kind)) {
    throw new UsageError("invalid_value", `unknown token kind: ${String(entry.kind)}`);
  }
  if (typeof entry.symbol !== "string") {
    throw new UsageError("invalid_value", `token ${entry.id} has no symbol`);
  }
  if (entry.name !== undefined && typeof entry.name !== "string") {
    throw new UsageError("invalid_value", `token ${entry.id} has an invalid name`);
  }
  return {
    kind: entry.kind,
    id: canonicalTokenId(entry.kind, entry.id),
    symbol: entry.symbol,
    decimals: checkedTokenDecimals(entry.decimals),
    ...(entry.name === undefined ? {} : { name: entry.name }),
  };
}

// Entries that share a canonical id after loading collapse in place, keeping the later entry's
// fields: the result equals replaying the file's adds with canonical ids.
export function parseTokensFile(raw: unknown): TokensFile {
  if (!isRecord(raw) || typeof raw.version !== "number" || !isRecord(raw.entries)) {
    throw invalid("the document is not a token book");
  }
  const entries: TokensFile["entries"] = {};
  for (const [scope, list] of Object.entries(raw.entries)) {
    if (!Array.isArray(list)) throw invalid(`${scope} is not a list`);
    const merged: TokenEntry[] = [];
    for (const item of list) {
      if (!isRecord(item) || typeof item.id !== "string") {
        throw invalid(`${scope} holds an entry without an id`);
      }
      let entry: TokenEntry;
      try {
        entry = tokenEntry(item as unknown as TokenEntry);
      } catch (error) {
        if (!(error instanceof CliError)) throw error;
        throw invalid(`${scope} holds an invalid entry ${item.id}: ${error.message}`);
      }
      const at = merged.findIndex((t) => t.kind === entry.kind && t.id === entry.id);
      if (at >= 0) merged[at] = entry;
      else merged.push(entry);
    }
    entries[scope] = merged;
  }
  return { version: raw.version, entries };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(reason: string): ExecutionError {
  return new ExecutionError("encoding_error", `tokens.json is invalid: ${reason}`);
}
