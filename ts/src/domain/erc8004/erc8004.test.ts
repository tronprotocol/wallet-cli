import { describe, expect, it } from "vitest";
import { identityRegistryFor, parseAgentId, resolveAgentId } from "./index.js";
import type { NetworkDescriptor } from "../types/index.js";

const net = (id: string): NetworkDescriptor => ({ id }) as NetworkDescriptor;

describe("ERC-8004 deployment selection", () => {
  it("selects the exact registry for each supported BSC/TRON network", () => {
    expect(identityRegistryFor(net("eip155:56"))).toBe(
      "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    );
    expect(identityRegistryFor(net("tron:2494104990"))).toBe("TH775ZzfJ5V25EZkFuX6SkbAP53ykXTcma");
  });

  it("never falls back when the selected network has no registry", () => {
    expect(() => identityRegistryFor(net("eip155:1"))).toThrowError(
      expect.objectContaining({ code: "unsupported_network_capability" }),
    );
  });

  it("parses arbitrarily large decimal agent ids without Number coercion", () => {
    expect(parseAgentId("9007199254740993")).toBe(9007199254740993n);
    expect(() => parseAgentId("1.5")).toThrowError(/unsigned decimal/);
  });

  it("accepts scoped ids only when they match the selected network", () => {
    expect(resolveAgentId("97:123", net("eip155:97"))).toBe(123n);
    expect(resolveAgentId("tron:3448148188:123", net("tron:3448148188"))).toBe(123n);
    expect(() => resolveAgentId("eip155:56:123", net("eip155:97"))).toThrowError(
      expect.objectContaining({ code: "invalid_value" }),
    );
  });
});
