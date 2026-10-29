import { z } from "zod";
import type { ChainFamily } from "../../../../domain/types/index.js";
import { addressCodec } from "../../../../domain/family/index.js";
import { slippageToBips } from "../../../../domain/sunpump/curve.js";
import { isZeroAmount } from "../../../../domain/amounts/index.js";
import { MAX_LABEL_LENGTH } from "../../../../domain/wallet/label.js";

export const Schemas = {
  addressFor: (family: ChainFamily) =>
    z
      .string()
      .refine((v) => addressCodec(family).validate(v), { message: `invalid ${family} address` }),
  // Family bindings validate the format; shared help must remain family-neutral.
  address: () => z.string().min(1),
  uintString: () => z.string().regex(/^\d+$/, "must be a non-negative integer string"),
  positiveIntString: () =>
    z
      .string()
      .regex(/^\d+$/, "must be a positive integer string")
      // Zod runs refinements after regex failure; BigInt could throw outside safeParse.
      .refine((v) => !isZeroAmount(v), { message: "must be greater than zero" }),
  amount: () => z.string().regex(/^\d+$/, "amount must be a non-negative integer string"),
  label: () => z.string().trim().min(1).max(MAX_LABEL_LENGTH),
};

export function addressFieldsFor(
  family: ChainFamily,
  ...names: string[]
): (value: Record<string, unknown>, ctx: z.RefinementCtx) => void {
  return validateAddressFields(family, false, names);
}

// Reports family_mismatch for valid addresses from another family.
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

// Reject invalid slippage before network I/O can mask the input error.
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
        message: error instanceof Error ? error.message.replace(`${flag} `, "") : "is not usable",
        params: { errorCode: "invalid_value" },
      });
    }
  };
}

export function allRefines<T>(
  ...refines: Array<(value: T, ctx: z.RefinementCtx) => void>
): (value: T, ctx: z.RefinementCtx) => void {
  return (value, ctx) => {
    for (const refine of refines) refine(value, ctx);
  };
}
