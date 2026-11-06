import { describe, expect, it } from "vitest";
import { parseChainId } from "./chain-id.js";

describe("parseChainId", () => {
  it.each([
    [728126428, "728126428"],
    ["728126428", "728126428"],
    ["0x2b6653dc", "728126428"],
    ["0X2B6653DC", "728126428"],
    [0, "0"],
  ])("reads %j as %s", (value, expected) => {
    expect(parseChainId(value)?.toString()).toBe(expected);
  });

  it("reads a bigint as itself and refuses a negative one", () => {
    expect(parseChainId(56n)).toBe(56n);
    expect(parseChainId(-1n)).toBeUndefined();
  });

  it.each([
    [""],
    ["0x"],
    ["56.0"],
    [" 56"],
    ["-1"],
    [-1],
    [1.5],
    [Number.MAX_SAFE_INTEGER + 1],
    [null],
    [{}],
  ])("rejects %j", (value) => {
    expect(parseChainId(value)).toBeUndefined();
  });
});
