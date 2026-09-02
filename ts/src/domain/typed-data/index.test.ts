import { describe, it, expect } from "vitest";
import { normalizeTypedData } from "./index.js";
import { CliError } from "../errors/index.js";

const DOMAIN = { name: "SunPerp", version: "1", chainId: 728126428 };
const TYPES = {
  Order: [
    { name: "trader", type: "address" },
    { name: "size", type: "uint256" },
  ],
};

describe("normalizeTypedData", () => {
  it("keeps a well-formed payload intact", () => {
    const p = normalizeTypedData({
      domain: DOMAIN,
      types: TYPES,
      message: { trader: "T1", size: "1" },
    });
    expect(p).toEqual({ domain: DOMAIN, types: TYPES, message: { trader: "T1", size: "1" } });
  });

  // MetaMask-style payloads include EIP712Domain in `types`; ethers' TypedDataEncoder throws on it.
  it("strips EIP712Domain from types", () => {
    const p = normalizeTypedData({
      domain: DOMAIN,
      types: { EIP712Domain: [{ name: "name", type: "string" }], ...TYPES },
      primaryType: "Order",
      message: { trader: "T1", size: "1" },
    });
    expect(p.types).toEqual(TYPES);
    expect(p.primaryType).toBe("Order");
  });

  it("accepts `value` as an alias for `message`", () => {
    const p = normalizeTypedData({
      domain: DOMAIN,
      types: TYPES,
      value: { trader: "T1", size: "1" },
    });
    expect(p.message).toEqual({ trader: "T1", size: "1" });
  });

  it("rejects a payload whose types contain only EIP712Domain", () => {
    expect(() =>
      normalizeTypedData({ domain: DOMAIN, types: { EIP712Domain: [] }, message: {} }),
    ).toThrow(/at least one struct type/);
  });

  it("rejects a missing message", () => {
    expect(() => normalizeTypedData({ domain: DOMAIN, types: TYPES })).toThrow(/message/);
  });

  it("rejects a non-object domain", () => {
    expect(() => normalizeTypedData({ domain: "x", types: TYPES, message: {} })).toThrow(/domain/);
  });

  it("rejects a primaryType that is not declared", () => {
    expect(() =>
      normalizeTypedData({ domain: DOMAIN, types: TYPES, primaryType: "Nope", message: {} }),
    ).toThrow(/not declared in types/);
  });

  // A nested (non-root) type is referenced by another struct, so it can never be what actually gets
  // signed — ethers signs the root regardless. Reject it rather than sign one thing and report another.
  const NESTED = {
    Outer: [
      { name: "who", type: "address" },
      { name: "detail", type: "Inner" },
    ],
    Inner: [{ name: "amount", type: "uint256" }],
  };

  it("rejects a primaryType that is nested inside another type (not a root)", () => {
    expect(() =>
      normalizeTypedData({ domain: DOMAIN, types: NESTED, primaryType: "Inner", message: {} }),
    ).toThrow(/not a root type/);
  });

  it("rejects a nested primaryType referenced through an array field", () => {
    const arrayNested = {
      Outer: [{ name: "items", type: "Inner[]" }],
      Inner: [{ name: "amount", type: "uint256" }],
    };
    expect(() =>
      normalizeTypedData({ domain: DOMAIN, types: arrayNested, primaryType: "Inner", message: {} }),
    ).toThrow(/not a root type/);
  });

  it("accepts a primaryType that is the root type", () => {
    const p = normalizeTypedData({
      domain: DOMAIN,
      types: NESTED,
      primaryType: "Outer",
      message: { who: "T1", detail: { amount: "1" } },
    });
    expect(p.primaryType).toBe("Outer");
  });

  it("accepts an omitted primaryType even with nested types", () => {
    const p = normalizeTypedData({
      domain: DOMAIN,
      types: NESTED,
      message: { who: "T1", detail: { amount: "1" } },
    });
    expect(p.primaryType).toBeUndefined();
  });

  it("rejects a malformed field list", () => {
    expect(() =>
      normalizeTypedData({ domain: DOMAIN, types: { Order: [{ name: "x" }] }, message: {} }),
    ).toThrow(/without a name\/type/);
  });

  // BUG-V413-020: a payload missing/malformed at the top-level shape is invalid_payload — "the
  // payload does not decode as what --typed-data says it is" — exit 2 (a caller can fix the JSON
  // and rerun), not invalid_value.
  describe("missing top-level fields report invalid_payload, exit 2", () => {
    const cases: Array<[string, unknown]> = [
      ["whole payload not an object", "not an object"],
      ["missing domain", { types: TYPES, message: {} }],
      ["missing types", { domain: DOMAIN, message: {} }],
      ["empty types (no struct besides EIP712Domain)", { domain: DOMAIN, types: {}, message: {} }],
      ["missing message", { domain: DOMAIN, types: TYPES }],
    ];

    it.each(cases)("%s", (_label, raw) => {
      let error: unknown;
      try {
        normalizeTypedData(raw);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(CliError);
      const cliError = error as CliError;
      expect(cliError.code).toBe("invalid_payload");
      expect(cliError.exitCode()).toBe(2);
    });
  });
});
