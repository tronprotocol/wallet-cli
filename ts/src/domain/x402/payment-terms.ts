// x402 payment values; amounts are token base units unless named whole-token.
import { errorMessage, inputRef, UsageError } from "../errors/index.js";
import { baseUnitAmount, type BaseUnits } from "../amounts/index.js";

export const X402_DEFAULT_VALIDITY_SECONDS = 300;
export const X402_MAX_VALIDITY_SECONDS = 86_400;
export const X402_MAX_TOKEN_DECIMALS = 18;

// x402 amounts are uint256 on every family.
const UINT256_LIMIT = 1n << 256n;

// Seconds a payment authorization stays valid; the default when none is given.
export function paymentValidity(seconds: number | undefined, field: string): number {
  const value = seconds ?? X402_DEFAULT_VALIDITY_SECONDS;
  if (!Number.isInteger(value) || value < 1 || value > X402_MAX_VALIDITY_SECONDS)
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef(field)} must be from 1 to ${X402_MAX_VALIDITY_SECONDS}`,
    );
  return value;
}

export function isPaymentDecimals(decimals: number): boolean {
  return Number.isInteger(decimals) && decimals >= 0 && decimals <= X402_MAX_TOKEN_DECIMALS;
}

// A positive uint256 in base units.
export function isPaymentRawAmount(raw: string): boolean {
  return /^\d{1,78}$/.test(raw) && BigInt(raw) > 0n && BigInt(raw) < UINT256_LIMIT;
}

export function paymentRawAmount(raw: string, field: string): BaseUnits {
  if (!isPaymentRawAmount(raw))
    throw new UsageError(
      "invalid_amount",
      errorMessage`${inputRef(field)} must be a positive uint256 in base units`,
    );
  return baseUnitAmount(raw);
}

// Whole tokens to base units without floating point; the result is a positive uint256.
export function paymentBaseUnits(amount: string, decimals: number, field: string): BaseUnits {
  if (!/^\d+(?:\.\d+)?$/.test(amount) || amount.length > 100)
    throw new UsageError(
      "invalid_amount",
      errorMessage`${inputRef(field)} must be a decimal string`,
    );
  const [whole, fraction = ""] = amount.split(".");
  if (fraction.length > decimals)
    throw new UsageError(
      "invalid_amount",
      errorMessage`${inputRef(field)} supports at most ${decimals} decimal places`,
    );
  const raw =
    BigInt(whole!) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (raw <= 0n || raw >= UINT256_LIMIT)
    throw new UsageError(
      "invalid_amount",
      errorMessage`${inputRef(field)} must be a positive uint256`,
    );
  return baseUnitAmount(raw);
}
