import { expect, it } from "vitest";
import type { NetworkDescriptor } from "../../../plugin-api/domain.js";
import { BAI_CAPABILITIES, baiDefaultToken } from "./capabilities.js";

const network = (id: string, family: "tron" | "evm"): NetworkDescriptor => ({
  id,
  family,
  chainId: id.split(":")[1]!,
  nativeSymbol: family === "tron" ? "TRX" : "ETH",
  capabilities: [],
});

it.each([
  ["eip155:8453", "USDC"],
  ["eip155:56", "USDT"],
  ["tron:728126428", "USDT"],
] as const)("a recharge on %s defaults to %s", (id, token) => {
  expect(baiDefaultToken(id)).toBe(token);
});

it.each([
  ["tron:728126428", "tron", "supported"],
  ["eip155:56", "evm", "supported"],
  ["eip155:8453", "evm", "supported"],
  ["tron:3448148188", "tron", "unsupported"],
  ["eip155:1", "evm", "unsupported"],
] as const)("recharge on %s is %s", (id, family, support) => {
  expect(BAI_CAPABILITIES["bai.recharge"]!(network(id, family))).toBe(support);
});
