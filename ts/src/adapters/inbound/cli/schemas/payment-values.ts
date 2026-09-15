import { z } from "zod";

export const uint256Max = (1n << 256n) - 1n;
export const paymentAmount = z
  .string()
  .refine(
    (value) =>
      /^\d+(?:\.\d+)?$/.test(value) &&
      /[1-9]/.test(value) &&
      value.length <= 100 &&
      BigInt(value.split(".")[0]!) <= uint256Max,
    {
      message: "must be a positive decimal amount within uint256",
      params: { errorCode: "invalid_amount" },
    },
  );
export const rawPaymentAmount = z
  .string()
  .refine(
    (value) =>
      /^\d+$/.test(value) &&
      value.length <= 78 &&
      BigInt(value) > 0n &&
      BigInt(value) <= uint256Max,
    { message: "must be a positive uint256 amount", params: { errorCode: "invalid_amount" } },
  );
export function integerLiteral(min: number, max: number) {
  return z
    .union([z.string().regex(/^\d+$/), z.number().int()])
    .pipe(z.coerce.number<string | number>().int().min(min).max(max));
}
