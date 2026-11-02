import { errorMessage, followUp, inputRef, UsageError, type InputRef } from "../../errors/index.js";

// java-tron uses a notional supply of 1e18.
const SUPPLY = 1e18;
export const TRX_TOKEN_ID = "_";

// Estimate in minimal units; Math.pow can differ from Java StrictMath.pow.
export function bancorOutput(sellReserve: bigint, buyReserve: bigint, sellQuant: bigint): bigint {
  if (sellReserve <= 0n || buyReserve <= 0n) return 0n;
  if (sellQuant <= 0n) return 0n;
  const newBalance = Number(sellReserve + sellQuant);
  // Match java-tron double arithmetic and truncation in both stages.
  const relay = Math.trunc(-SUPPLY * (1 - Math.pow(1 + Number(sellQuant) / newBalance, 0.0005)));
  const out = Math.trunc(Number(buyReserve) * (Math.pow(1 + relay / SUPPLY, 2000) - 1));
  return out > 0 ? BigInt(out) : 0n;
}

// Floor after percentage slippage; the protocol requires a positive expected output.
export function slippageFloor(predicted: bigint, percent: number): bigint {
  if (!(percent > 0 && percent < 100)) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("slippage")} must be greater than 0 and less than 100`,
    );
  }
  if (predicted <= 0n) {
    throw new UsageError(
      "invalid_value",
      "this trade is too small to return anything at the current reserves",
    );
  }
  // Floor tolerance to millionths of a percent, so rounding cannot weaken the output guarantee.
  const MICRO_PERCENT = 1_000_000;
  const micro = BigInt(Math.floor(percent * MICRO_PERCENT));
  const scale = BigInt(100 * MICRO_PERCENT);
  const floor = (predicted * (scale - micro)) / scale;
  return floor > 0n ? floor : 1n;
}

// Exact minimal-unit counterpart for inject/withdraw; safe for rejection checks.
export function proportionalOther(
  thisReserve: bigint,
  otherReserve: bigint,
  quant: bigint,
): bigint {
  if (thisReserve <= 0n) return 0n;
  return (otherReserve * quant) / thisReserve;
}

// Accepts TRX or numeric ids; token names can contain the pair separator (:).
export function normalizeTokenId(input: string): string {
  const value = input.trim();
  if (value.toUpperCase() === "TRX" || value === TRX_TOKEN_ID) return TRX_TOKEN_ID;
  if (/^\d+$/.test(value)) return value;
  throw new UsageError(
    "invalid_value",
    errorMessage`"${input}" is not a token id — use TRX or a numeric TRC10 id (look one up with \`${followUp("asset-info")}\`)`,
  );
}

export function tokenIdLabel(tokenId: string): string {
  return tokenId === TRX_TOKEN_ID ? "TRX" : tokenId;
}

export function splitPair(value: string, input: InputRef): [string, string] {
  const parts = value.split(":");
  if (parts.length !== 2 || !parts[0]?.trim() || !parts[1]?.trim()) {
    throw new UsageError("invalid_value", errorMessage`${input} must be <a>:<b>`);
  }
  return [parts[0]!, parts[1]!];
}
