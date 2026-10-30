import { z } from "zod";
import type { ChainSpec, ExclusiveGroup, FamilyBinding } from "../contracts/index.js";
import { Schemas } from "../schemas/index.js";
import { TextFormatters } from "../render/index.js";
import type { MessageService } from "../../../../application/use-cases/message-service.js";
import { isZeroAmount } from "../../../../domain/amounts/index.js";
import {
  MAX_PERMISSION_ID,
  OWNER_PERMISSION_ID,
} from "../../../../domain/tron/permission/index.js";
import { MAX_TRON_EXPIRATION_MS } from "../../../../domain/transaction/index.js";

export const LEDGER_TRON_SETTINGS_NOTE =
  'Ledger: enable "Custom contracts" and "Sign by Hash" in the TRON app settings.\n';

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
      `transaction expiration in ms, up to ${MAX_TRON_EXPIRATION_MS} (24h); only with --sign-only or --build-only; omitted = node default (~60s)`,
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

// For commands without --sign-only.
export const unsignedTxModeExclusive: ExclusiveGroup = {
  ...txModeExclusive,
  flags: ["dry-run", "build-only"],
};

export const governanceTxModeFields = {
  ...txModeFields,
  ...tronTxModeFields,
  buildOnly: z
    .boolean()
    .default(false)
    .describe("build an unsigned transaction without signing or broadcasting"),
};

export function tronExpirationRefine(
  value: { signOnly?: boolean; buildOnly?: boolean; expiration?: number },
  ctx: z.RefinementCtx,
): void {
  if (value.expiration !== undefined && !value.signOnly && !value.buildOnly) {
    ctx.addIssue({
      code: "custom",
      path: ["expiration"],
      message: "only valid with --sign-only or --build-only",
    });
  }
}
// Use regex for zero checks: Zod runs refinements even after the format check fails.
const positiveDecimalAmount = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "must be a non-negative decimal string")
  .refine((v) => !isZeroAmount(v), { message: "must be greater than zero" });

export function unifiedAmountFields(amountDesc: string, rawDesc: string) {
  return {
    amount: positiveDecimalAmount.optional().describe(amountDesc),
    rawAmount: Schemas.positiveIntString().optional().describe(rawDesc),
  };
}

const messageSignFields = z.object({
  message: z.string().min(1).optional().describe("message text to sign"),
});

export const messageSignSpec: ChainSpec = {
  path: ["message", "sign"],
  stdin: "message",
  network: "optional",
  wallet: "optional",
  auth: "required",
  capability: "message.sign",
  summary: "Sign an arbitrary message (TIP-191/V2 · EIP-191)",
  description:
    "Sign an arbitrary message. The prefix follows the selected network's family:\n" +
    "TIP-191/V2 for TRON, EIP-191 for EVM.",
  baseFields: messageSignFields,
  exclusive: [
    { label: "the message to sign", flags: ["message", "message-stdin"], select: "exactly-one" },
  ],
  examples: [
    { cmd: `wallet-cli message sign --message "hello" --network nile` },
    { cmd: `wallet-cli message sign --message "hello" --network sepolia` },
  ],
  formatText: TextFormatters.messageSign,
};

export const messageSignBinding = (service: MessageService): FamilyBinding => ({
  run: async (ctx, net, input) => {
    const message = ctx.secrets.pick(input.message, "message", "message");
    return service.sign(ctx, net, ctx.activeAccount, message);
  },
});
