import { describe, it, expect } from "vitest";
import { isOriginEnergyLimit, percent, witnessUrl } from "./limits.js";

describe("percent", () => {
  it.each([0, 100])("accepts %s", (v) => expect(percent(v, "brokerage")).toBe(v));
  it.each([-1, 101, 0.5, Number.NaN])("rejects %s", (v) => {
    expect(() => percent(v, "brokerage")).toThrowError(
      expect.objectContaining({ code: "invalid_value" }),
    );
  });
});

describe("witnessUrl", () => {
  it("trims and accepts exactly 256 UTF-8 bytes", () => {
    expect(witnessUrl(` ${"a".repeat(256)} `)).toHaveLength(256);
  });
  it.each(["", "é".repeat(129)])("rejects %j", (v) => {
    expect(() => witnessUrl(v)).toThrowError(expect.objectContaining({ code: "invalid_value" }));
  });
});

describe("isOriginEnergyLimit", () => {
  it.each([1, "50000000", "9223372036854775807"])("accepts %j", (v) => {
    expect(isOriginEnergyLimit(v)).toBe(true);
  });
  it.each([0, "0", -1, 1.5, "9223372036854775808", "1e3", ""])("rejects %j", (v) => {
    expect(isOriginEnergyLimit(v)).toBe(false);
  });
});
