import { errorMessage, inputRef, UsageError } from "../../errors/index.js";
import { utf8ByteLength } from "../governance/limits.js";
import { FAMILIES } from "../../family/index.js";

const INT32_MAX = 2_147_483_647n;
export const TRC10_MAX_PRECISION = 6;
export const TRC10_URL_MAX_BYTES = 256;
export const TRC10_DESCRIPTION_MAX_BYTES = 200;
// The chain rejects spaces and non-ASCII bytes in names and abbreviations.
const VISIBLE_ASCII = /^[\x21-\x7E]{1,32}$/;
const SUN_PER_TRX = 10n ** BigInt(FAMILIES.tron.nativeDecimals);

// trxNum SUN buys num minimal token units.
export interface IcoRate {
  trxNum: number;
  num: number;
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

// Converts whole TRX : whole tokens to an int32 pair at the asset precision.
export function icoRate(trx: bigint, tokens: bigint, precision: number): IcoRate {
  if (trx <= 0n || tokens <= 0n) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("price")} needs a positive TRX amount and a positive token amount`,
    );
  }
  if (!Number.isInteger(precision) || precision < 0 || precision > 6) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("precision")} must be an integer between 0 and ${TRC10_MAX_PRECISION}`,
    );
  }
  const num = tokens * 10n ** BigInt(precision);
  const trxNum = trx * SUN_PER_TRX;
  const divisor = gcd(num, trxNum);
  const reducedNum = num / divisor;
  const reducedTrxNum = trxNum / divisor;
  if (reducedNum > INT32_MAX || reducedTrxNum > INT32_MAX) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("price")} cannot be represented on chain at precision ${precision}: it reduces to ${reducedTrxNum}:${reducedNum}, and both sides must fit in a 32-bit integer. Use a simpler ratio.`,
    );
  }
  return { trxNum: Number(reducedTrxNum), num: Number(reducedNum) };
}

// Returns minimal units; multiply before truncating, with no refund of the remainder.
export function icoTokensFor(paidSun: bigint, rate: IcoRate): bigint {
  if (paidSun <= 0n) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("pay")} must be greater than zero`,
    );
  }
  return (paidSun * BigInt(rate.num)) / BigInt(rate.trxNum);
}

// Returns the reduced whole TRX : whole tokens ratio.
export function icoPriceLabel(rate: IcoRate, precision: number): { trx: bigint; tokens: bigint } {
  const scale = 10n ** BigInt(precision);
  const tokens = BigInt(rate.num) * SUN_PER_TRX;
  const trx = BigInt(rate.trxNum) * scale;
  const divisor = gcd(tokens, trx);
  return { trx: trx / divisor, tokens: tokens / divisor };
}

export function trc10Precision(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > TRC10_MAX_PRECISION) {
    throw new UsageError(
      "invalid_value",
      `TRC10 precision must be an integer from 0 to ${TRC10_MAX_PRECISION}`,
    );
  }
  return value;
}

// A TRC10 name or abbreviation; field names the input.
export function trc10Symbol(value: string, field: string): string {
  if (!VISIBLE_ASCII.test(value)) {
    throw new UsageError(
      "invalid_asset_name",
      errorMessage`${inputRef(field)} must be 1-32 visible ASCII characters, with no spaces`,
    );
  }
  return value;
}

export function trc10Url(value: string): string {
  return withinBytes(value, TRC10_URL_MAX_BYTES, "url", false);
}

// An empty description is allowed.
export function trc10Description(value: string): string {
  return withinBytes(value, TRC10_DESCRIPTION_MAX_BYTES, "description", true);
}

// Whole tokens; a supply must be positive.
export function trc10Supply(value: string): bigint {
  const text = value.trim();
  if (!/^\d+$/.test(text)) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("supply")} must be a whole number`,
    );
  }
  const supply = BigInt(text);
  if (supply <= 0n) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("supply")} must be greater than zero`,
    );
  }
  return supply;
}

function withinBytes(value: string, max: number, field: string, allowEmpty: boolean): string {
  const bytes = utf8ByteLength(value);
  if (!allowEmpty && bytes === 0) {
    throw new UsageError("invalid_value", errorMessage`${inputRef(field)} must not be empty`);
  }
  if (bytes > max) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef(field)} must be at most ${max} bytes`,
    );
  }
  return value;
}
