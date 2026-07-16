import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ciEnum, enumOptions, introspectFields } from "./index.js";

describe("enumOptions", () => {
  it("returns the literals of an enum field (through optional/default wrappers)", () => {
    expect(enumOptions(z.enum(["tron", "ethereum"]))).toEqual(["tron", "ethereum"]);
    expect(enumOptions(z.enum(["a", "b"]).optional())).toEqual(["a", "b"]);
  });
  it("returns undefined for non-enum fields", () => {
    expect(enumOptions(z.string())).toBeUndefined();
  });
  it("descends ciEnum's preprocess pipe to find the literals (through default/optional)", () => {
    expect(enumOptions(ciEnum(["energy", "bandwidth"]))).toEqual(["energy", "bandwidth"]);
    expect(enumOptions(ciEnum(["energy", "bandwidth"]).default("bandwidth"))).toEqual(["energy", "bandwidth"]);
    expect(enumOptions(ciEnum(["native", "token"]).optional())).toEqual(["native", "token"]);
  });
});

describe("ciEnum", () => {
  const schema = ciEnum(["energy", "bandwidth"]);
  it("accepts the canonical lowercase literal", () => {
    expect(schema.parse("energy")).toBe("energy");
  });
  it("accepts upper/mixed case and normalizes to the lowercase literal", () => {
    expect(schema.parse("ENERGY")).toBe("energy");
    expect(schema.parse("BandWidth")).toBe("bandwidth");
  });
  it("still rejects values outside the literal set", () => {
    expect(schema.safeParse("cpu").success).toBe(false);
  });
});

describe("introspectFields — defaults & choices", () => {
  const fields = introspectFields(
    z.object({
      to: z.string().describe("recipient"),
      feeLimit: z.coerce.number().int().positive().default(100_000_000).describe("fee cap"),
      resource: z.enum(["energy", "bandwidth"]).default("bandwidth").describe("resource type"),
      only: z.enum(["native", "token"]).optional().describe("filter"),
      flag: z.boolean().default(false).describe("a switch"),
    }),
  );
  const by = (name: string) => fields.find((f) => f.name === name)!;

  it("captures the default value of a defaulted field", () => {
    expect(by("feeLimit").defaultValue).toBe(100_000_000);
    expect(by("resource").defaultValue).toBe("bandwidth");
    expect(by("flag").defaultValue).toBe(false);
  });

  it("leaves defaultValue undefined for non-defaulted fields", () => {
    expect(by("to").defaultValue).toBeUndefined();
    expect(by("only").defaultValue).toBeUndefined();
  });

  it("captures enum choices (through default/optional wrappers)", () => {
    expect(by("resource").choices).toEqual(["energy", "bandwidth"]);
    expect(by("only").choices).toEqual(["native", "token"]);
    expect(by("to").choices).toBeUndefined();
  });
});

describe("introspectFields — baseType & array fields", () => {
  const fields = introspectFields(
    z.object({
      to: z.string().describe("a string"),
      flag: z.boolean().describe("a switch"),
      resource: ciEnum(["energy", "bandwidth"]).describe("an enum via ciEnum's preprocess pipe"),
      for: z.array(z.string().min(1)).min(1).max(30).describe("a repeatable string flag"),
    }),
  );
  const by = (name: string) => fields.find((f) => f.name === name)!;

  it("reports a repeatable array field as its per-entry element type, and marks isArray", () => {
    expect(by("for").baseType).toBe("string");
    expect(by("for").isArray).toBe(true);
  });

  it("reports scalars as their own type and not an array", () => {
    expect(by("to").baseType).toBe("string");
    expect(by("to").isArray).toBe(false);
    expect(by("flag").baseType).toBe("boolean");
    expect(by("flag").isArray).toBe(false);
  });

  it("never leaks the internal 'pipe' type — a ciEnum resolves past the preprocess pipe", () => {
    expect(by("resource").baseType).not.toBe("pipe");
    expect(by("resource").isArray).toBe(false);
    expect(by("resource").choices).toEqual(["energy", "bandwidth"]);
  });
});
