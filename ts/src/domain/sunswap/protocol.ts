// Unknown or lowercase scopes return empty API results; validate and normalize locally.
import { errorMessage, inputRef, UsageError } from "../errors/index.js";

export const SUNSWAP_PROTOCOLS = ["ALL", "V1", "V1_5", "V2", "V3", "V4", "CURVE"] as const;

export type SunSwapProtocol = (typeof SUNSWAP_PROTOCOLS)[number];

// Pool/position filters omit ALL; absence of a filter includes every protocol.
export const SUNSWAP_PROTOCOL_FILTERS = SUNSWAP_PROTOCOLS.filter(
  (value) => value !== "ALL",
) as readonly SunSwapProtocol[];

// ALL aggregates token statistics across protocols; scopes must not be added together.
export const SUNSWAP_SCOPES = SUNSWAP_PROTOCOLS;

export function normaliseProtocol(
  value: string,
  permitted: readonly SunSwapProtocol[] = SUNSWAP_PROTOCOLS,
): SunSwapProtocol {
  const upper = value.trim().toUpperCase();
  if (!permitted.includes(upper as SunSwapProtocol)) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("protocol")} must be one of ${permitted.join(", ")}`,
    );
  }
  return upper as SunSwapProtocol;
}

export const LIQUIDITY_PROTOCOLS = ["V2", "V3", "V4"] as const;

export type LiquidityProtocol = (typeof LIQUIDITY_PROTOCOLS)[number];

// Case-insensitive; surrounding whitespace is not accepted.
export function liquidityProtocolOf(value: string): LiquidityProtocol | undefined {
  const upper = value.toUpperCase();
  return LIQUIDITY_PROTOCOLS.find((protocol) => protocol === upper);
}

export function parseLiquidityProtocol(value: unknown): LiquidityProtocol {
  const protocol = typeof value === "string" ? liquidityProtocolOf(value) : undefined;
  if (protocol === undefined) {
    throw new UsageError("invalid_value", "liquidity protocol must be V2, V3 or V4", {
      protocol: String(value),
    });
  }
  return protocol;
}

// V4 pool IDs are 64 hex characters with an optional 0x prefix.
export function isPoolId(value: string): boolean {
  return /^(0x)?[0-9a-fA-F]{64}$/.test(value.trim());
}

export function normalisePoolId(value: string): string {
  return value.trim().replace(/^0x/, "");
}
