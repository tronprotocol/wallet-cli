import { UsageError } from "../errors/index.js";

/** Recharge destinations supplied by the service owner on 2026-09-07. */
export const BAI_RECHARGE_ADDRESSES: Readonly<Record<string, string>> = Object.freeze({
  tron: "TSNEPtuCagKEgF2EU4pAKWLzXLz1bekfTE",
  solana: "AEtyXM8nwieUwSLifLQAmGFHwcuwSFVkfyF2XCWNUzmp",
  bnb: "0x060f7fd9c9622bdcf9f2887c8171d6e6b4b4ba17",
  ethereum: "0x3f380aaac9488aef452add4cc74b3d052dd02621",
  arbitrum: "0x406c163d8dab7e313c76699597baa5b11bf8bbd9",
  optimism: "0x6d32e2f9a38416f468f33a4fb14c4b80ef99007f",
  polygon: "0xe6cb7671d26b62f9c4f423d76ce8a558d249f48e",
  base: "0x10bf3d09bd80a00ddbbfe934c7dcc477b42ffdb0",
});

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
