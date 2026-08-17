/**
 * TRC10 ICO rate — the conversion between the human `--price <trx>:<tokens>` and the pair of
 * int32s the chain actually stores.
 *
 * On chain a TRC10's price is `trx_num` sun buying `num` minimal units, so the pair is coupled to
 * the asset's precision:
 *
 *     num / trx_num  =  (tokens × 10^precision) / (trx × 10^6)
 *
 * The same `--price 1:100` therefore lands as `trx_num=1, num=100` at precision 6 but
 * `trx_num=10000, num=1` at precision 0. Both members are int32 on the wire, so the fraction is
 * reduced to lowest terms and rejected if either side still overflows — an issuance is
 * irreversible, and a silently truncated rate would price the token wrong forever.
 */
import { UsageError } from "../errors/index.js";

const INT32_MAX = 2_147_483_647n;
const SUN_PER_TRX = 1_000_000n;

/** the on-chain ICO rate pair: `trxNum` sun buys `num` minimal units. */
export interface IcoRate {
  trxNum: number;
  num: number;
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

/**
 * Whole TRX : whole tokens, at a given precision → the reduced on-chain pair.
 * Throws `invalid_value` when either side cannot be expressed as a positive int32.
 */
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

/**
 * Minimal units received for a payment, the way the chain computes it: multiply first, then
 * divide, so the truncation lands exactly where the actuator's does. The paid TRX is transferred
 * in full — any remainder is not refunded.
 */
export function icoTokensFor(paidSun: bigint, rate: IcoRate): bigint {
  if (paidSun <= 0n) throw new UsageError("invalid_value", "--pay must be greater than zero");
  return (paidSun * BigInt(rate.num)) / BigInt(rate.trxNum);
}

/**
 * The rate as whole TRX : whole tokens, for display. Inverts `icoRate`, reducing again so the
 * output is the simplest pair that means the same thing.
 */
export function icoPriceLabel(rate: IcoRate, precision: number): { trx: bigint; tokens: bigint } {
  const scale = 10n ** BigInt(precision);
  // tokens/trx = (num / 10^precision) / (trxNum / 10^6) = num × 10^6 / (trxNum × 10^precision)
  const tokens = BigInt(rate.num) * SUN_PER_TRX;
  const trx = BigInt(rate.trxNum) * scale;
  const divisor = gcd(tokens, trx);
  return { trx: trx / divisor, tokens: tokens / divisor };
}
