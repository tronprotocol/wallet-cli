import { describe, it, expect } from "vitest";
import { z } from "zod";
import { enumOptions, introspectFields } from "./index.js";

describe("enumOptions", () => {
  it("returns the literals of an enum field (through optional/default wrappers)", () => {
    expect(enumOptions(z.enum(["tron", "ethereum"]))).toEqual(["tron", "ethereum"]);
    expect(enumOptions(z.enum(["a", "b"]).optional())).toEqual(["a", "b"]);
  });
  it("returns undefined for non-enum fields", () => {
    expect(enumOptions(z.string())).toBeUndefined();
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
