import { z } from "zod";
import type { ExclusiveGroup } from "../contracts/index.js";
import {
  MAX_PERMISSION_ID,
  OWNER_PERMISSION_ID,
} from "../../../../domain/tron/permission/index.js";
import { MAX_TRON_EXPIRATION_MS } from "../../../../domain/transaction/index.js";

export const tronTxModeFields = {
  permissionId: z.coerce
    .number()
    .int()
    .min(OWNER_PERMISSION_ID)
    .max(MAX_PERMISSION_ID)
    .default(OWNER_PERMISSION_ID)
    .describe("TRON permission group to sign with (0=owner, 1=witness, 2-9=active)"),
  expiration: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_TRON_EXPIRATION_MS)
    .optional()
    .describe(
      `transaction expiration in ms, up to ${MAX_TRON_EXPIRATION_MS} (24h); only with --sign-only or --build-only; omitted = node default (~60s), at least 10 minutes when signed on a Ledger`,
    ),
};

export const txModeFields = {
  dryRun: z
    .boolean()
    .default(false)
    .describe("build and estimate only, with no signature and no broadcast"),
  signOnly: z
    .boolean()
    .default(false)
    .describe("sign and output complete transaction hex without broadcasting"),
  buildOnly: z
    .boolean()
    .default(false)
    .describe(
      "build and output unsigned complete transaction hex without unlocking; the entry point for multi-party signing (relay it with `tx sign`, or open a queue with `tx multisig --create`)",
    ),
};

export const txModeExclusive: ExclusiveGroup = {
  label: "the transaction mode; omit all for sign and broadcast",
  flags: ["dry-run", "sign-only", "build-only"],
  select: "at-most-one",
};
