/**
 * Typed shapes for the TRON node read responses consumed by transaction use cases.
 *
 * tronweb's `getTransaction` / `getTransactionInfo` are typed `any`, so the fields the CLI reads
 * (status, fee, block, energy, transfer parties) used to be probed with scattered `(x as any)?.…`
 * in the command layer. These schemas pin the *consumed subset* in one place and validate it once
 * at the RPC boundary, so `tx.ts` reads typed fields instead.
 *
 * Design notes — node reads must never fail on shape:
 *  - every field is optional + `.catch(undefined)`: a wrong-typed field degrades to absent, it
 *    never throws.
 *  - the top-level `preprocess` coerces non-objects (tronweb returns `{}` / odd values for
 *    not-found txs) to `{}` so `.parse` is total.
 *  - `looseObject` passes unknown keys through, so the parsed value still carries the full raw
 *    response for the `transaction` / `info` JSON passthrough in TxInfoView.
 *  - numeric fields use `coerce` because TronGrid is inconsistent about number vs string.
 */
import { z } from "zod";
import type { TronTx, TronTxInfo } from "../../../../application/ports/chain/tron-gateway.js";

const optNum = z.coerce.number().optional().catch(undefined);
const optStr = z.string().optional().catch(undefined);

/** non-object → {} so parsing a not-found / malformed read is total (generic preserves inference). */
const objectish = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((v) => (v && typeof v === "object" ? v : {}), inner);

const TronTxInfoSchema = objectish(
  z.looseObject({
    blockNumber: optNum,
    fee: optNum,
    receipt: z
      .looseObject({ result: optStr, energy_usage_total: optNum })
      .optional()
      .catch(undefined),
  }),
);

const TronContractSchema = z.looseObject({
  type: optStr,
  parameter: z
    .looseObject({
      // transfer party fields are read with hexToBase58/String() coercion downstream, so a loose
      // record is enough — no need to re-validate every TRON contract variant's value shape.
      value: z.looseObject({}).optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
});

const TronTxSchema = objectish(
  z.looseObject({
    ret: z.array(z.looseObject({ contractRet: optStr })).optional().catch(undefined),
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
