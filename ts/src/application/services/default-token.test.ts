import { expect, it } from "vitest";
import { defaultToken } from "./default-token.js";

it.each([
  ["x402.serve", "tron:728126428", "USDT"],
  ["x402.serve", "eip155:8453", "USDT"],
  ["bai.recharge", "eip155:8453", "USDC"],
  ["bai.recharge", "eip155:56", "USDT"],
  ["bai.recharge", "tron:728126428", "USDT"],
  ["gasfree.transfer", "tron:3448148188", "USDT"],
] as const)("%s on %s defaults to %s", (capability, network, token) => {
  expect(defaultToken(capability, network)).toBe(token);
});

it("gives the capability default without a network", () => {
  expect(defaultToken("bai.recharge")).toBe("USDT");
  expect(defaultToken("gasfree.transfer")).toBe("USDT");
});
