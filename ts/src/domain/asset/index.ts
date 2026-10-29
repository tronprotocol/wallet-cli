import { UsageError } from "../errors/index.js";
import { FAMILIES } from "../family/index.js";

const INT32_MAX = 2_147_483_647n;
export const TRC10_MAX_PRECISION = 6;
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
      "--price needs a positive TRX amount and a positive token amount",
    );
  }
  if (!Number.isInteger(precision) || precision < 0 || precision > 6) {
    throw new UsageError("invalid_value", "--precision must be an integer between 0 and 6");
  }
  const num = tokens * 10n ** BigInt(precision);
  const trxNum = trx * SUN_PER_TRX;
  const divisor = gcd(num, trxNum);
  const reducedNum = num / divisor;
  const reducedTrxNum = trxNum / divisor;
  if (reducedNum > INT32_MAX || reducedTrxNum > INT32_MAX) {
    throw new UsageError(
      "invalid_value",
      `--price cannot be represented on chain at precision ${precision}: it reduces to ${reducedTrxNum}:${reducedNum}, ` +
        "and both sides must fit in a 32-bit integer. Use a simpler ratio.",
    );
  }
  return { trxNum: Number(reducedTrxNum), num: Number(reducedNum) };
}

// Returns minimal units; multiply before truncating, with no refund of the remainder.
export function icoTokensFor(paidSun: bigint, rate: IcoRate): bigint {
  if (paidSun <= 0n) throw new UsageError("invalid_value", "--pay must be greater than zero");
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
