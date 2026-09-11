import { UsageError } from "../errors/index.js";

const minimums: Readonly<Record<string, string>> = Object.freeze({
  TRX: "15",
  USDT: "1",
  USDC: "1",
  ETH: "0.0001",
  SOL: "0.01",
});

/** Compare decimal quantities exactly; equality is accepted and unlisted tokens have no floor. */
export function assertBaiRechargeMinimum(token: string, amount: string): void {
  const minimum = minimums[token.toUpperCase()];
  if (!minimum) return;
  const [whole, fraction = ""] = amount.split(".");
  const [minimumWhole, minimumFraction = ""] = minimum.split(".");
  const scale = Math.max(fraction.length, minimumFraction.length);
  if (
    BigInt(whole + fraction.padEnd(scale, "0")) <
    BigInt(minimumWhole + minimumFraction.padEnd(scale, "0"))
  ) {
    throw new UsageError(
      "invalid_value",
      `${token.toUpperCase()} minimum recharge is ${minimum}; no preorder or payment was sent`,
    );
  }
}

/** Validate decimal quantities without converting payment amounts to floating point. */
export function baiRechargeAmount(value: string): string {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value))
    throw new UsageError("invalid_value", "Recharge amount must be a positive decimal string");
  const normalized = value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  const [whole = "0", fraction = ""] = normalized.split(".");
  if (
    normalized === "0" ||
    BigInt(whole) > 9007199254740991n ||
    (whole === "9007199254740991" && fraction !== "")
  )
    throw new UsageError("invalid_value", "Recharge amount exceeds the supported positive range");
  return normalized;
}
