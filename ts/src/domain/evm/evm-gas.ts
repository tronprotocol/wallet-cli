// Prices are decimal wei strings; BigInt preserves precision beyond Number.MAX_SAFE_INTEGER.
import { errorMessage, inputRef, UsageError, type UserMessage } from "../errors/index.js";
import { weiAmount, type Wei } from "../amounts/index.js";

export type EvmFeeMode = "eip1559" | "legacy";

export interface EvmFeeOverrides {
  maxFeeWei?: string;
  priorityFeeWei?: string;
  gasLimit?: string;
}

export interface EvmFeeInput {
  // Latest block baseFeePerGas; absent without EIP-1559.
  baseFeeWei?: string;
  // From eth_maxPriorityFeePerGas.
  suggestedPriorityWei?: string;
  gasPriceWei: string;
  // Unpadded estimate, unless overridden.
  gasLimit: string;
  // Only "legacy" forces the mode.
  declaredFeeModel?: string;
  overrides?: EvmFeeOverrides;
}

export interface EvmFeePlan {
  mode: EvmFeeMode;
  gasLimit: string;
  maxFeeWei?: string;
  priorityFeeWei?: string;
  gasPriceWei?: string;
  maxCostWei: string;
  warnings?: UserMessage[];
}

// Zero base fee still supports EIP-1559; an explicit legacy declaration overrides detection.
export function evmFeeMode(baseFeeWei?: string, declared?: string): EvmFeeMode {
  if (declared === "legacy") return "legacy";
  return baseFeeWei === undefined ? "legacy" : "eip1559";
}

// Preserve the estimated gas limit unless explicitly overridden.
export function planEvmFee(input: EvmFeeInput): EvmFeePlan {
  const mode = evmFeeMode(input.baseFeeWei, input.declaredFeeModel);
  const overrides = input.overrides ?? {};
  const gasLimit = overrides.gasLimit ?? input.gasLimit;

  if (mode === "legacy") {
    // Reject unsupported overrides rather than silently signing a different fee.
    if (overrides.maxFeeWei !== undefined || overrides.priorityFeeWei !== undefined) {
      throw new UsageError(
        "invalid_option",
        errorMessage`${inputRef("maxFee")} and ${inputRef("priorityFee")} need an EIP-1559 chain; this network prices in gasPrice`,
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
  // Double the base fee to allow for increases before inclusion.
  const maxFee =
    overrides.maxFeeWei !== undefined
      ? BigInt(overrides.maxFeeWei)
      : base * 2n + (priorityGiven ?? suggested);
  // Nodes reject tips above maxFee; clamp suggestions to the user ceiling.
  const clamped = priorityGiven === undefined && suggested > maxFee;
  const priority = priorityGiven ?? (clamped ? maxFee : suggested);

  const warnings: UserMessage[] = [];
  if (clamped) {
    warnings.push(
      errorMessage`${inputRef("maxFee")} ${maxFee} wei is below the node's suggested tip of ${suggested} wei, so the tip was reduced to match it; a node rejects a tip above the fee cap`,
    );
  }
  if (maxFee < base) {
    warnings.push(
      errorMessage`${inputRef("maxFee")} ${maxFee} wei is below the current base fee of ${base} wei; this transaction cannot be included until the base fee falls`,
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

// Convert gwei to wei with string arithmetic; only the gwei suffix is accepted.
// Require a leading number to distinguish foreign units from non-numeric input.
const FOREIGN_UNIT = /^[\d.]+\s*([a-z]+)$/i;

export const GWEI_DECIMALS = 9; // 1 gwei = 10^9 wei

export function gweiToWei(gwei: string): Wei {
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
  if (fraction.length > GWEI_DECIMALS) {
    throw new UsageError("invalid_value", `${value} gwei is finer than one wei`);
  }
  return weiAmount(BigInt(`${match[1]}${fraction.padEnd(GWEI_DECIMALS, "0")}`));
}
