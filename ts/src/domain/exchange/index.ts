/**
 * Bancor exchange — TRON's protocol-level automatic market maker for TRX and TRC10.
 *
 * `bancorOutput` is a port of java-tron's `ExchangeProcessor` (chainbase, `capsule/`), which prices
 * a trade in two stages against a notional supply of 1e18:
 *
 *     relay = trunc( -SUPPLY × (1 − (1 + q/(sellReserve+q))^0.0005) )
 *     out   = trunc(  buyReserve × ((1 + relay/SUPPLY)^2000 − 1) )
 *
 * **This is an estimate, never a gate.** The chain evaluates those powers with Java's
 * `StrictMath.pow`; JavaScript's `Math.pow` is not specified to produce identical bits, so our
 * result may differ from the node's in the last unit. That is fine for deriving a percentage
 * slippage floor or showing a `--dry-run` preview, and unacceptable as a reason to refuse a
 * transaction — a local rejection that is one unit wrong blocks a trade the chain would accept,
 * with no override. See docs/adr/0002-bancor-math-advises-never-gates.md.
 *
 * The proportional helpers below are different in kind: `proportionalOther` is the exact integer
 * arithmetic the inject/withdraw actuators perform, so it *is* safe to reject on.
 */
import { UsageError } from "../errors/index.js";

/** the notional supply both java-tron processors are built around. */
const SUPPLY = 1e18;
/** TRON stores TRX's token id as a single underscore. */
export const TRX_TOKEN_ID = "_";

/**
 * Tokens received for selling `sellQuant` into a pair, at the given reserves.
 * Returns an **estimate** — see the module note. Zero when the trade is too small to move the
 * curve by a whole unit.
 */
export function bancorOutput(sellReserve: bigint, buyReserve: bigint, sellQuant: bigint): bigint {
  if (sellReserve <= 0n || buyReserve <= 0n) return 0n;
  if (sellQuant <= 0n) return 0n;
  const newBalance = Number(sellReserve + sellQuant);
  // Both stages mirror java-tron's own double arithmetic, including the truncating casts.
  const relay = Math.trunc(-SUPPLY * (1 - Math.pow(1 + Number(sellQuant) / newBalance, 0.0005)));
  const out = Math.trunc(Number(buyReserve) * (Math.pow(1 + relay / SUPPLY, 2000) - 1));
  return out > 0 ? BigInt(out) : 0n;
}

/**
 * The floor to send on chain for a percentage slippage tolerance: the predicted output less
 * `percent`, rounded down. Clamped to at least 1 because the protocol rejects a non-positive
 * `expected`.
 */
export function slippageFloor(predicted: bigint, percent: number): bigint {
  if (!(percent > 0 && percent < 100)) {
    throw new UsageError("invalid_value", "--slippage must be greater than 0 and less than 100");
  }
  if (predicted <= 0n) {
    throw new UsageError(
      "invalid_value",
      "this trade is too small to return anything at the current reserves",
    );
  }
  // basis points keep the percentage in integer arithmetic; fractions finer than 0.01% round down.
  const bps = BigInt(Math.round((100 - percent) * 100));
  const floor = (predicted * bps) / 10_000n;
  return floor > 0n ? floor : 1n;
}

/**
 * The other side's quantity when injecting or withdrawing, exactly as the actuators compute it:
 * `floor(otherReserve × quant / thisReserve)` in integer arithmetic. Exact, so callers may reject
 * on it.
 */
export function proportionalOther(
  thisReserve: bigint,
  otherReserve: bigint,
  quant: bigint,
): bigint {
  if (thisReserve <= 0n) return 0n;
  return (otherReserve * quant) / thisReserve;
}

/**
 * java-tron's withdraw-only "Not precise enough" rule: the exact quotient, rounded to 4 decimal
 * places, may exceed the truncated integer by no more than 0.01% of it.
 *
 * Reproduced here for documentation and messages only — the check itself is left to the node,
 * because which of the two hardfork variants is active cannot be read from an RPC.
 */
export function withdrawIsPrecise(
  thisReserve: bigint,
  otherReserve: bigint,
  quant: bigint,
): boolean {
  const other = proportionalOther(thisReserve, otherReserve, quant);
  if (other <= 0n) return false;
  // quotient at 4 dp, half-up, in integer arithmetic: round(otherReserve*quant*10^4 / thisReserve)
  const scaled = otherReserve * quant * 10_000n;
  const quotient4dp = (scaled + thisReserve / 2n) / thisReserve;
  const remainder4dp = quotient4dp - other * 10_000n;
  // remainder > other * 0.0001  ⇔  remainder4dp > other  (both sides scaled by 10^4)
  return remainder4dp <= other;
}

/**
 * Accept `TRX` in any case, the literal `_`, or a numeric TRC10 id; normalise to the on-chain form.
 * Names are deliberately not accepted in this group: a TRC10 name may contain `:`, which would make
 * `--pair A:B:1000123` ambiguous.
 */
export function normalizeTokenId(input: string): string {
  const value = input.trim();
  if (value.toUpperCase() === "TRX" || value === TRX_TOKEN_ID) return TRX_TOKEN_ID;
  if (/^\d+$/.test(value)) return value;
  throw new UsageError(
    "invalid_value",
    `"${input}" is not a token id — use TRX or a numeric TRC10 id (look one up with \`asset info <name>\`)`,
  );
}

/** `TRX` for the native side, otherwise the numeric id — the display form of a token id. */
export function tokenIdLabel(tokenId: string): string {
  return tokenId === TRX_TOKEN_ID ? "TRX" : tokenId;
}

/** split a `<a>:<b>` pair flag into its two halves. */
export function splitPair(value: string, flag: string): [string, string] {
  const parts = value.split(":");
  if (parts.length !== 2 || !parts[0]?.trim() || !parts[1]?.trim()) {
    throw new UsageError("invalid_value", `${flag} must be <a>:<b>`);
  }
  return [parts[0]!, parts[1]!];
}
