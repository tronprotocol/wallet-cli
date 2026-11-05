import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseInputSchema } from "./index.js";

describe("parseInputSchema", () => {
  const schema = z
    .object({ a: z.string().optional(), b: z.string().optional() })
    .superRefine((value, ctx) => {
      if (value.a && value.b) {
        ctx.addIssue({
          code: "custom",
          path: ["a"],
          message: "provide exactly one of --a or --b",
          params: { errorCode: "invalid_option" },
        });
      }
      if (value.a === "bad") {
        ctx.addIssue({ code: "custom", path: ["a"], message: "invalid evm address" });
      }
      if (value.a === "rpc") {
        ctx.addIssue({
          code: "custom",
          path: ["a"],
          message: "not actually a usage error",
          params: { errorCode: "rpc_error" },
        });
      }
      if (value.a === "bogus") {
        ctx.addIssue({
          code: "custom",
          path: ["a"],
          message: "unknown code",
          params: { errorCode: "not_a_real_code" },
        });
      }
    });

  it("uses the code a refine declares", () => {
    expect(() => parseInputSchema(schema, { a: "1", b: "2" })).toThrowError(
      expect.objectContaining({ code: "invalid_option" }),
    );
  });

  it("keeps invalid_value for a refine that declares nothing", () => {
    expect(() => parseInputSchema(schema, { a: "bad" })).toThrowError(
      expect.objectContaining({ code: "invalid_value" }),
    );
  });

  it("still reports an absent required field as missing_option", () => {
    const required = z.object({ needed: z.string() });
    expect(() => parseInputSchema(required, {})).toThrowError(
      expect.objectContaining({ code: "missing_option" }),
    );
  });

  it.each([
    [{ field: "token", placeholder: "address" }, "<address>"],
    [{ field: "uri" }, "<uri>"],
  ])("names a positional argument as its usage line does (%o)", (positional, shown) => {
    const schema = z.object({ [positional.field]: z.string().min(2) });
    expect(() => parseInputSchema(schema, {}, [positional])).toThrowError(
      `missing required argument ${shown}`,
    );
    expect(() => parseInputSchema(schema, { [positional.field]: "x" }, [positional])).toThrowError(
      `invalid ${shown}:`,
    );
  });

  it("refuses a declared code whose dictionary exit is not a usage exit", () => {
    expect(() => parseInputSchema(schema, { a: "rpc" })).toThrowError(
      expect.objectContaining({ code: "invalid_value" }),
    );
  });

  it("refuses a declared code that is not in the dictionary at all", () => {
    expect(() => parseInputSchema(schema, { a: "bogus" })).toThrowError(
      expect.objectContaining({ code: "invalid_value" }),
    );
  });
});
