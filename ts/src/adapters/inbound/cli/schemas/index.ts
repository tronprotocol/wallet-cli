/**
 * Schemas — shared, reusable zod primitives commands compose into their own input
 * schemas. One zod = validation + types + help + agent schema (no drift). Pure: only the
 * family address codec, no I/O.
 */
import { z } from "zod";
import type { ChainFamily } from "../../../../domain/types/index.js";
import { addressCodec } from "../../../../domain/family/index.js";
import { slippageToBips } from "../../../../domain/sunpump/curve.js";

/** shared, reusable zod primitives (values). */
export const Schemas = {
  /** the single, family-parametrised address validator (no per-family hardcoded aliases). */
  addressFor: (family: ChainFamily) =>
    z
      .string()
      .refine((v) => addressCodec(family).validate(v), { message: `invalid ${family} address` }),
  /** A family-neutral address flag: shape only, no format check. For a flag every family has
   *  (`--contract`), so it stays ONE flag in `baseFields` — help and catalog merge same-named
   *  family fields last-writer-wins, which would show one family's text for both. The owning
   *  family validates the format via `addressFieldsFor` in its binding's `refine`. */
  address: () => z.string().min(1),
  /** non-negative big integer as a string (wei/sun are always safe as strings). */
  uintString: () => z.string().regex(/^\d+$/, "must be a non-negative integer string"),
  /** positive big integer as a string (rejects 0); for fee limits, lock periods, etc. */
  positiveIntString: () =>
    z
      .string()
      .regex(/^\d+$/, "must be a positive integer string")
      // regex-based, never BigInt: zod keeps running refinements after the regex fails,
      // so a throwing check (e.g. BigInt("1.5")) would escape safeParse.
      .refine((v) => !/^0+$/.test(v), { message: "must be greater than zero" }),
  amount: () => z.string().regex(/^\d+$/, "amount must be a non-negative integer string"),
  label: () => z.string().trim().min(1).max(64),
};

/**
 * Refine that validates `names` as `family` addresses — the family half of a `Schemas.address()`
 * flag. Message and issue path match what `Schemas.addressFor` produced when the check lived on
 * the field itself, so the error a user sees does not change with the move.
 */
export function addressFieldsFor(
  family: ChainFamily,
  ...names: string[]
): (value: Record<string, unknown>, ctx: z.RefinementCtx) => void {
  return validateAddressFields(family, false, names);
}

/** ERC-8004 distinguishes valid addresses belonging to another family. */
export function addressFamilyFieldsFor(family: ChainFamily, ...names: string[]) {
  return validateAddressFields(family, true, names);
}

function validateAddressFields(
  family: ChainFamily,
  detectFamily: boolean,
  names: string[],
): (value: Record<string, unknown>, ctx: z.RefinementCtx) => void {
  return (value, ctx) => {
    for (const name of names) {
      const candidate = value[name];
      if (typeof candidate === "string" && !addressCodec(family).validate(candidate)) {
        ctx.addIssue({
          code: "custom",
          path: [name],
          message: `invalid ${family} address`,
          params: {
            errorCode:
              detectFamily && addressCodec(family === "evm" ? "tron" : "evm").validate(candidate)
                ? "family_mismatch"
                : "invalid_address",
          },
        });
      }
    }
  };
}

/**
 * Refine that validates a caller-supplied `--slippage` at PARSE time.
 *
 * The conversion to basis points is a pure function of the string, so it needs no chain state, no
 * market decision and no quote — and doing it here rather than in the use case has two effects worth
 * having. A bad tolerance is refused in milliseconds instead of after an on-chain read. And the
 * refusal becomes DETERMINISTIC: behind a network read, a rate-limited node wins the race and the
 * caller gets a provider error at exit 1 for input that was always going to be rejected at exit 2.
 * That is what made the golden cases for it flake.
 *
 * The domain check stays where it is. It is still the check on the DEFAULT, which no caller typed,
 * and it is the one that runs whatever calls the use case.
 */
export function slippageField(
  field = "slippage",
  flag = "--slippage",
): (value: Record<string, unknown>, ctx: z.RefinementCtx) => void {
  return (value, ctx) => {
    const given = value[field];
    if (typeof given !== "string") return;
    try {
      slippageToBips(given, flag);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        path: [field],
        // The domain's own words, so the same input produces the same message wherever it is caught.
        message: error instanceof Error ? error.message.replace(`${flag} `, "") : "is not usable",
        params: { errorCode: "invalid_value" },
      });
    }
  };
}

/** Run several refines as one — a FamilyBinding carries a single `refine`. */
export function allRefines<T>(
  ...refines: Array<(value: T, ctx: z.RefinementCtx) => void>
): (value: T, ctx: z.RefinementCtx) => void {
  return (value, ctx) => {
    for (const refine of refines) refine(value, ctx);
  };
}
