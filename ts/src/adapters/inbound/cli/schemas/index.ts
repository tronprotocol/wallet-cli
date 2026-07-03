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
    z.string().refine((v) => addressCodec(family).validate(v), { message: `invalid ${family} address` }),
  /** non-negative big integer as a string (wei/sun are always safe as strings). */
  uintString: () => z.string().regex(/^\d+$/, "must be a non-negative integer string"),
  /** positive big integer as a string (rejects 0); for fee limits, lock periods, etc. */
  positiveIntString: () =>
    z.string().regex(/^\d+$/, "must be a positive integer string")
      // regex-based, never BigInt: zod keeps running refinements after the regex fails,
      // so a throwing check (e.g. BigInt("1.5")) would escape safeParse.
      .refine((v) => !/^0+$/.test(v), { message: "must be greater than zero" }),
  amount: () => z.string().regex(/^\d+$/, "amount must be a non-negative integer string"),
  label: () => z.string().trim().min(1).max(64),
};
