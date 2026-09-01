import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseInputSchema } from "./index.js";

/**
 * A cross-field rule — mutual exclusion, a missing dependency, a malformed address — is a `custom`
 * zod issue, and every one of them used to arrive as `invalid_value`. A refine now states its own
 * code; one that says nothing keeps the old answer, so the 34 refines that never opted in are
 * untouched.
 */
describe("parseInputSchema", () => {
  const schema = z.object({ a: z.string().optional(), b: z.string().optional() }).superRefine(
    (value, ctx) => {
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
      // A refine that reaches for an exit-1 code: input validation is definitionally usage-layer
      // (exit 2), so this must be refused, not honored — see the guard in parseInputSchema.
      if (value.a === "rpc") {
        ctx.addIssue({
          code: "custom",
          path: ["a"],
          message: "not actually a usage error",
          params: { errorCode: "rpc_error" },
        });
      }
      // A refine that names a code the dictionary has never heard of.
      if (value.a === "bogus") {
        ctx.addIssue({
          code: "custom",
          path: ["a"],
          message: "unknown code",
          params: { errorCode: "not_a_real_code" },
        });
      }
    },
  );

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
