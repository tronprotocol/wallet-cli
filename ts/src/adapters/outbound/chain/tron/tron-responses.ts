// Tolerate malformed optional fields and retain unknown fields for raw JSON output.
import { z } from "zod";
import type { TronTx, TronTxInfo } from "../../../../application/ports/chain/tron-gateway.js";

const optNum = z.coerce.number().optional().catch(undefined);
const optStr = z.string().optional().catch(undefined);

const objectish = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((v) => (v && typeof v === "object" ? v : {}), inner);

const TronTxInfoSchema = objectish(
  z.looseObject({
    blockNumber: optNum,
    fee: optNum,
    receipt: z
      .looseObject({
        // Preserve numeric results as strings so they cannot be mistaken for an absent result.
        result: z.union([z.string(), z.number()]).transform(String).optional().catch(undefined),
        energy_usage_total: optNum,
        energy_fee: optNum,
        net_usage: optNum,
        net_fee: optNum,
      })
      .optional()
      .catch(undefined),
  }),
);

const TronContractSchema = z.looseObject({
  type: optStr,
  parameter: z
    .looseObject({
      value: z.looseObject({}).optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
});

const TronTxSchema = objectish(
  z.looseObject({
    ret: z
      .array(z.looseObject({ contractRet: optStr }))
      .optional()
      .catch(undefined),
    raw_data: z
      .looseObject({ contract: z.array(TronContractSchema).optional().catch(undefined) })
      .optional()
      .catch(undefined),
  }),
);

export function parseTronTxInfo(raw: unknown): TronTxInfo {
  return TronTxInfoSchema.parse(raw) as TronTxInfo;
}

export function parseTronTx(raw: unknown): TronTx {
  return TronTxSchema.parse(raw) as TronTx;
}
