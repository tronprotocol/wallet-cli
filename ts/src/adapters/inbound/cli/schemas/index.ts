/**
 * Schemas — shared, reusable zod primitives commands compose into their own input
 * schemas. One zod = validation + types + help + agent schema (no drift). Pure: only the
 * family address codec, no I/O.
 */
import { z } from "zod";
import type { ChainFamily } from "../../../../domain/types/index.js";
import { addressCodec } from "../../../../domain/family/index.js";

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
  return (value, ctx) => {
    for (const name of names) {
      const candidate = value[name];
      if (typeof candidate === "string" && !addressCodec(family).validate(candidate)) {
        ctx.addIssue({ code: "custom", path: [name], message: `invalid ${family} address` });
      }
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
