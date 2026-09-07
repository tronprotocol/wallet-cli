import { describe, expect, it } from "vitest";
import { parseAgentId, resolveAgentId } from "./index.js";
import type { NetworkDescriptor } from "../types/index.js";

const net = (id: string): NetworkDescriptor => ({ id }) as NetworkDescriptor;

describe("ERC-8004 deployment selection", () => {
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

it("rejects IDs that cannot be encoded as uint256", () => {
  expect(() => parseAgentId((1n << 256n).toString())).toThrowError(
    expect.objectContaining({ code: "invalid_value" }),
  );
  expect(parseAgentId(((1n << 256n) - 1n).toString())).toBe((1n << 256n) - 1n);
});
