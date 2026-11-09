import { parse as parseLosslessJson } from "lossless-json";
import type { TronAsset } from "../../../../application/ports/chain/tron/tron-gateway.js";
import { ChainError } from "../../../../domain/errors/index.js";
import { normalizeAccountValue } from "./node-values.js";

// Preserve int64 quantities and decode hex text, leaving owner addresses in hex.
export function parseTronAssetResponse(text: string): TronAsset {
  return decodeAssetText(normalizeAccountValue(parseLosslessJson(text))) as TronAsset;
}

const ASSET_TEXT_KEYS = new Set(["name", "abbr", "url", "description"]);

function decodeAssetText(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeAssetText);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      ASSET_TEXT_KEYS.has(key) && typeof entry === "string"
        ? hexToUtf8(entry)
        : decodeAssetText(entry),
    ]),
  );
}

function hexToUtf8(value: string): string {
  if (value === "" || !/^([0-9a-fA-F]{2})+$/.test(value)) return value;
  return Buffer.from(value, "hex").toString("utf8");
}

// Absent TRC10 precision means zero; explicit values must be in 0..6.
const TRC10_MAX_PRECISION = 6;
const INT32_MAX = 2_147_483_647;

function assetViolation(asset: TronAsset): string | undefined {
  const precision = asset.precision;
  if (
    precision !== undefined &&
    (!Number.isInteger(precision) || precision < 0 || precision > TRC10_MAX_PRECISION)
  ) {
    return `precision ${JSON.stringify(precision)} is outside the protocol range 0..${TRC10_MAX_PRECISION}`;
  }
  for (const field of ["trx_num", "num"] as const) {
    const value = asset[field];
    if (!Number.isInteger(value) || value <= 0 || value > INT32_MAX) {
      return `${field} ${JSON.stringify(value)} is not a positive int32`;
    }
  }
  return undefined;
}

export function assertUsableAsset(asset: TronAsset, requestedId?: string): TronAsset {
  if (requestedId !== undefined && String(asset.id) !== requestedId) {
    throw new ChainError(
      "invalid_node_response",
      `asked the node for TRC10 ${requestedId} and it answered with ${JSON.stringify(asset.id)}`,
    );
  }
  const violation = assetViolation(asset);
  if (violation) {
    throw new ChainError("invalid_node_response", `TRC10 ${String(asset.id)}: ${violation}`);
  }
  return asset;
}

// Drop unusable rows so one invalid asset does not discard the whole page.
export function assetList(text: string): TronAsset[] {
  const raw = parseTronAssetResponse(text) as unknown as { assetIssue?: unknown };
  const assets = Array.isArray(raw.assetIssue) ? (raw.assetIssue as TronAsset[]) : [];
  return assets.filter((asset) => assetViolation(asset) === undefined);
}

export function exchangeValue(text: string): Record<string, unknown> {
  return normalizeAccountValue(parseLosslessJson(text)) as Record<string, unknown>;
}
