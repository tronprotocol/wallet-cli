import { describe, it, expect } from "vitest";
import { z } from "zod";
import { enumOptions } from "./index.js";

describe("enumOptions", () => {
  it("returns the literals of an enum field (through optional/default wrappers)", () => {
    expect(enumOptions(z.enum(["tron", "ethereum"]))).toEqual(["tron", "ethereum"]);
    expect(enumOptions(z.enum(["a", "b"]).optional())).toEqual(["a", "b"]);
  });
  it("returns undefined for non-enum fields", () => {
    expect(enumOptions(z.string())).toBeUndefined();
  });
});
