/**
 * The EVM gas fee model — pure arithmetic over numbers the gateway supplies.
 *
 * The mode decision is the load-bearing part. Measured on the four builtin chains:
 *   ethereum / sepolia → baseFeePerGas non-zero
 *   bsc / bsc-testnet  → baseFeePerGas PRESENT BUT ZERO
 * so "the field is non-zero" would misclassify BSC. A zero base fee is not the absence of
 * EIP-1559: it is EIP-1559 where the whole fee is the tip, which is exactly BSC's model — and
 * the 1559 arithmetic degenerates to the legacy one on its own, with no second code path.
 */
import { describe, it, expect } from "vitest";
import { evmFeeMode, gweiToWei, planEvmFee } from "./evm-gas.js";

const GAS_LIMIT = "21000";

describe("evmFeeMode", () => {
  it("treats a non-zero base fee as EIP-1559", () => {
    expect(evmFeeMode("155315168")).toBe("eip1559");
  });

  it("treats a ZERO base fee as EIP-1559 too — that is BSC, not a legacy chain", () => {
    expect(evmFeeMode("0")).toBe("eip1559");
  });

  it("falls back to legacy when the chain reports no base fee at all", () => {
    expect(evmFeeMode(undefined)).toBe("legacy");
  });

  // The escape hatch: a chain that advertises a base fee but refuses type-2 transactions can be
  // pinned through the network's own feeModel rather than by patching the detection.
  it("lets a network force legacy despite reporting a base fee", () => {
    expect(evmFeeMode("155315168", "legacy")).toBe("legacy");
  });

  it("ignores the umbrella evm-gas label and decides from the chain", () => {
    expect(evmFeeMode("0", "evm-gas")).toBe("eip1559");
    expect(evmFeeMode(undefined, "evm-gas")).toBe("legacy");
  });
});

describe("planEvmFee — EIP-1559", () => {
  const base = { baseFeeWei: "100", suggestedPriorityWei: "10", gasPriceWei: "110" };

  it("defaults maxFee to base doubled plus the priority tip", () => {
    const plan = planEvmFee({ ...base, gasLimit: GAS_LIMIT });

    expect(plan).toMatchObject({
      mode: "eip1559",
      maxFeeWei: "210",
      priorityFeeWei: "10",
      gasLimit: GAS_LIMIT,
    });
  });

  it("reports the worst-case cost as gasLimit times maxFee", () => {
    expect(planEvmFee({ ...base, gasLimit: GAS_LIMIT }).maxCostWei).toBe(String(21000n * 210n));
  });

  it("honours both overrides verbatim", () => {
    const plan = planEvmFee({
      ...base,
      gasLimit: GAS_LIMIT,
      overrides: { maxFeeWei: "500", priorityFeeWei: "20" },
    });

    expect(plan).toMatchObject({ maxFeeWei: "500", priorityFeeWei: "20" });
  });

  it("clamps a suggested tip that exceeds a user-supplied maxFee", () => {
    // maxPriorityFeePerGas > maxFeePerGas is rejected by nodes; the user's ceiling wins.
    const plan = planEvmFee({
      ...base,
      suggestedPriorityWei: "900",
      gasLimit: GAS_LIMIT,
      overrides: { maxFeeWei: "500" },
    });

    expect(plan.priorityFeeWei).toBe("500");
  });

  it("derives maxFee from a lone priority override", () => {
    const plan = planEvmFee({ ...base, gasLimit: GAS_LIMIT, overrides: { priorityFeeWei: "50" } });

    expect(plan).toMatchObject({ maxFeeWei: "250", priorityFeeWei: "50" });
  });

  it("takes the gas limit override over the estimate", () => {
    expect(
      planEvmFee({ ...base, gasLimit: GAS_LIMIT, overrides: { gasLimit: "90000" } }).gasLimit,
    ).toBe("90000");
  });

  // BSC: base fee zero means the whole fee is the tip, and the formula produces exactly that.
  it("degenerates to a tip-only fee when the base fee is zero", () => {
    const plan = planEvmFee({
      baseFeeWei: "0",
      suggestedPriorityWei: "50000000",
      gasPriceWei: "50000000",
      gasLimit: GAS_LIMIT,
    });

    expect(plan).toMatchObject({ mode: "eip1559", maxFeeWei: "50000000" });
  });
});

describe("planEvmFee — legacy", () => {
  const legacy = { gasPriceWei: "3000000000", gasLimit: GAS_LIMIT };

  it("prices from gasPrice and reports no 1559 fields", () => {
    const plan = planEvmFee(legacy);

    expect(plan).toMatchObject({ mode: "legacy", gasPriceWei: "3000000000" });
    expect(plan.maxFeeWei).toBeUndefined();
    expect(plan.priorityFeeWei).toBeUndefined();
  });

  it("reports the cost as gasLimit times gasPrice", () => {
    expect(planEvmFee(legacy).maxCostWei).toBe(String(21000n * 3000000000n));
  });

  // Silently dropping a fee flag the chain cannot honour would misreport what was signed.
  it("refuses a 1559 override on a legacy chain", () => {
    expect(() => planEvmFee({ ...legacy, overrides: { maxFeeWei: "500" } })).toThrow(
      /legacy|1559|not support/i,
    );
    expect(() => planEvmFee({ ...legacy, overrides: { priorityFeeWei: "5" } })).toThrow();
  });

  it("still accepts a gas limit override", () => {
    expect(planEvmFee({ ...legacy, overrides: { gasLimit: "50000" } }).gasLimit).toBe("50000");
  });
});

describe("gweiToWei", () => {
  it("scales by nine decimal places", () => {
    expect(gweiToWei("30")).toBe("30000000000");
    expect(gweiToWei("0.05")).toBe("50000000");
  });

  it("keeps sub-gwei precision down to a single wei", () => {
    expect(gweiToWei("0.000000001")).toBe("1");
  });

  // The reason this is string arithmetic and not `parseFloat(x) * 1e9`: past 2^53 a float cannot
  // represent consecutive integers, so the scaled result would come back off by one wei — and a
  // fee ceiling is not a place to silently lose the last digit.
  it("stays exact for a value whose wei amount exceeds Number.MAX_SAFE_INTEGER", () => {
    expect(gweiToWei("9007199.254740993")).toBe("9007199254740993");
    expect(Number("9007199254740993")).toBe(9007199254740992); // what a float would have given
  });

  it("rejects a value finer than one wei rather than rounding it away", () => {
    expect(() => gweiToWei("0.0000000001")).toThrow();
  });

  it("rejects text that is not a number", () => {
    expect(() => gweiToWei("fast")).toThrow();
  });

  // §6.1 promised `cast`-style suffixes. Only the one that names this flag's own unit is honoured:
  // it cannot change the value, and refusing it only punishes a copied `cast` line.
  it("accepts a gwei suffix as a synonym for the bare number", () => {
    expect(gweiToWei("25gwei")).toBe("25000000000");
    expect(gweiToWei("25 GWEI")).toBe("25000000000");
    expect(gweiToWei("0.05gwei")).toBe(gweiToWei("0.05"));
  });

  // The reason the other suffixes stay out: one flag spanning nine orders of magnitude means a
  // typo costs a billion times the fee. Refused by name, not silently reinterpreted.
  it("refuses any other unit by name", () => {
    for (const bad of ["0.01ether", "25wei", "25 eth"]) {
      expect(() => gweiToWei(bad)).toThrow(/read in gwei/);
    }
  });
});

/**
 * The two ways a fee plan can be quietly wrong.
 *
 * Both produce a signable transaction, and neither raises an error anywhere downstream: the node
 * accepts what it is given, and the transaction simply never gets mined — or gets mined paying a
 * tip the caller did not choose. An error would be wrong (the caller may mean it); silence was
 * worse.
 */
describe("planEvmFee — warnings", () => {
  const chain = {
    baseFeeWei: "1000000000",
    gasPriceWei: "1100000000",
    suggestedPriorityWei: "1000000",
    gasLimit: "21000",
  };

  it("says so when the suggested tip had to be cut down to the fee cap", () => {
    const plan = planEvmFee({ ...chain, overrides: { maxFeeWei: "500000" } });

    expect(plan.priorityFeeWei).toBe("500000");
    expect(plan.warnings?.join(" ")).toMatch(/tip was reduced/);
  });

  it("says so when the fee cap is below the base fee, so it cannot be included", () => {
    const plan = planEvmFee({ ...chain, overrides: { maxFeeWei: "500000" } });

    expect(plan.warnings?.join(" ")).toMatch(/cannot be included until the base fee falls/);
  });

  // An explicit tip is the caller's decision, not something to report back at them.
  it("does not warn about a tip the caller chose", () => {
    const plan = planEvmFee({
      ...chain,
      overrides: { maxFeeWei: "3000000000", priorityFeeWei: "2000000" },
    });

    expect(plan.warnings).toBeUndefined();
  });

  it("stays silent on an ordinary plan", () => {
    expect(planEvmFee(chain).warnings).toBeUndefined();
  });
});
