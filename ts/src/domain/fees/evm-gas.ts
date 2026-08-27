/**
 * The EVM gas fee model — pure arithmetic, zero I/O. The gateway reads the numbers off the chain;
 * this decides what they mean and what a transaction will cost at worst.
 *
 * Everything is a decimal wei string carried through BigInt: a gas price times a gas limit
 * comfortably exceeds Number.MAX_SAFE_INTEGER, and this figure is what a user is shown before
 * they agree to spend it.
 */
import { UsageError } from "../errors/index.js";

export type EvmFeeMode = "eip1559" | "legacy";

export interface EvmFeeOverrides {
  maxFeeWei?: string;
  priorityFeeWei?: string;
  gasLimit?: string;
}

export interface EvmFeeInput {
  /** the latest block's baseFeePerGas; absent when the chain does not implement EIP-1559. */
  baseFeeWei?: string;
  /** the node's suggested tip (`eth_maxPriorityFeePerGas`). */
  suggestedPriorityWei?: string;
  gasPriceWei: string;
  /** the estimate, used unless overridden — deliberately not padded (see `plan`). */
  gasLimit: string;
  /** the network's declared fee model, used only to force legacy. */
  declaredFeeModel?: string;
  overrides?: EvmFeeOverrides;
}

export interface EvmFeePlan {
  mode: EvmFeeMode;
  gasLimit: string;
  maxFeeWei?: string;
  priorityFeeWei?: string;
  gasPriceWei?: string;
  /** the most this transaction can cost: gasLimit × the per-gas ceiling. */
  maxCostWei: string;
  /**
   * Things the caller should know about what was decided for them.
   *
   * The plan stays pure — it returns the sentences, it does not emit them. Both conditions here
   * are cases where the transaction is still signable and still WRONG in a way no error would
   * report: silently adjusting someone's fee, or signing one the chain will not currently accept.
   */
  warnings?: string[];
}

/**
 * Which transaction type this chain takes.
 *
 * A base fee of ZERO still means EIP-1559 — that is BSC, where the base fee is always zero and
 * the entire fee is the tip. Requiring a non-zero value would misclassify it and force a second
 * code path for a case the 1559 arithmetic already handles: with base = 0 the formula collapses
 * to "the fee is the tip", which is precisely the legacy behaviour on that chain.
 *
 * `declared` is the escape hatch. A chain that advertises a base fee but rejects type-2
 * transactions can be pinned with `feeModel: "legacy"` in its network entry, without anyone
 * having to special-case it here. The umbrella "evm-gas" label declares nothing and is ignored.
 */
export function evmFeeMode(baseFeeWei?: string, declared?: string): EvmFeeMode {
  if (declared === "legacy") return "legacy";
  return baseFeeWei === undefined ? "legacy" : "eip1559";
}

/**
 * Resolve the fee a transaction will be signed with.
 *
 * The gas limit is the estimate as-is, never padded: a silent multiplier would inflate the
 * ceiling shown by `--dry-run`, and the point of that number is that it is the truth. When an
 * estimate really is too tight — a contract call racing a state change — `--gas-limit` is the
 * explicit way to say so.
 */
export function planEvmFee(input: EvmFeeInput): EvmFeePlan {
  const mode = evmFeeMode(input.baseFeeWei, input.declaredFeeModel);
  const overrides = input.overrides ?? {};
  const gasLimit = overrides.gasLimit ?? input.gasLimit;

  if (mode === "legacy") {
    // Accepting a flag the chain cannot honour would misreport what was actually signed.
    if (overrides.maxFeeWei !== undefined || overrides.priorityFeeWei !== undefined) {
      throw new UsageError(
        "invalid_option",
        "--max-fee and --priority-fee need an EIP-1559 chain; this network prices in gasPrice",
      );
    }
    return {
      mode,
      gasLimit,
      gasPriceWei: input.gasPriceWei,
      maxCostWei: (BigInt(gasLimit) * BigInt(input.gasPriceWei)).toString(10),
    };
  }

  const base = BigInt(input.baseFeeWei ?? "0");
  const suggested = BigInt(input.suggestedPriorityWei ?? "0");
  const priorityGiven =
    overrides.priorityFeeWei === undefined ? undefined : BigInt(overrides.priorityFeeWei);
  // A lone --max-fee keeps the node's suggested tip; a lone --priority-fee sets the ceiling from
  // it. Doubling the base leaves room for it to rise over the next few blocks, which is the
  // usual headroom rule and the reason the ceiling is not just base + tip.
  const maxFee =
    overrides.maxFeeWei !== undefined
      ? BigInt(overrides.maxFeeWei)
      : base * 2n + (priorityGiven ?? suggested);
  // maxPriorityFeePerGas above maxFeePerGas is rejected outright by nodes, so the user's ceiling
  // wins over a suggestion that outgrew it.
  const clamped = priorityGiven === undefined && suggested > maxFee;
  const priority = priorityGiven ?? (clamped ? maxFee : suggested);

  const warnings: string[] = [];
  if (clamped) {
    warnings.push(
      `--max-fee ${maxFee} wei is below the node's suggested tip of ${suggested} wei, so the tip was reduced to match it; a node rejects a tip above the fee cap`,
    );
  }
  // Signable, and unmineable until the base fee falls to meet it. Nothing downstream reports
  // this: the node accepts the transaction and it simply sits there.
  if (maxFee < base) {
    warnings.push(
      `--max-fee ${maxFee} wei is below the current base fee of ${base} wei; this transaction cannot be included until the base fee falls`,
    );
  }

  return {
    mode,
    gasLimit,
    maxFeeWei: maxFee.toString(10),
    priorityFeeWei: priority.toString(10),
    maxCostWei: (BigInt(gasLimit) * maxFee).toString(10),
    ...(warnings.length ? { warnings } : {}),
  };
}

/**
 * Gas prices are quoted in gwei everywhere a human reads them — wallets, explorers, docs — so the
 * fee flags take gwei while everything downstream carries wei. Nine zeros is a real typo risk in
 * the other direction.
 *
 * Scaled by string manipulation rather than float arithmetic: `0.05 * 1e9` is not exactly
 * 50000000 in binary floating point, and a fee is not a place to discover that.
 *
 * A `gwei` suffix is accepted as a synonym (`25gwei` === `25`): it names the unit the flag already
 * reads, so it cannot change the number, and someone pasting a `cast` line should not be stopped
 * by it. Every OTHER unit is refused by name — one flag spanning nine orders of magnitude is how
 * `0.01ether` and `25` end up a billion apart, and that is the whole reason this flag takes one
 * unit rather than `cast`'s several.
 */
// Anchored on a leading number so a non-numeric value ("fast") still gets the plain "not a gwei
// amount" message rather than being reported as an unknown unit.
const FOREIGN_UNIT = /^[\d.]+\s*([a-z]+)$/i;

export function gweiToWei(gwei: string): string {
  const value = gwei.trim().replace(/\s*gwei$/i, "");
  const foreign = FOREIGN_UNIT.exec(value);
  if (foreign) {
    throw new UsageError(
      "invalid_value",
      `fee rates are read in gwei, so ${foreign[1]} is not accepted: pass 25 or 25gwei, not ${gwei.trim()}`,
    );
  }
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new UsageError("invalid_value", `not a gwei amount: ${gwei}`);
  const fraction = match[2] ?? "";
  if (fraction.length > 9) {
    throw new UsageError("invalid_value", `${value} gwei is finer than one wei`);
  }
  return BigInt(`${match[1]}${fraction.padEnd(9, "0")}`).toString(10);
}
