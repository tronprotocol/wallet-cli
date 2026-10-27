import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import { Schemas } from "../schemas/index.js";
import { TextFormatters } from "../render/index.js";
import type { MessageService } from "../../../../application/use-cases/message-service.js";

export const LEDGER_TRON_SETTINGS_NOTE =
  'Ledger: enable "Custom contracts" and "Sign by Hash" in the TRON app settings.\n';

export const tronTxModeFields = {
  permissionId: z.coerce
    .number()
    .int()
    .min(0)
    .max(9)
    .default(0)
    .describe("TRON permission group to sign with (0=owner, 1=witness, 2-9=active)"),
  expiration: z.coerce
    .number()
    .int()
    .min(1)
    .max(86_400_000)
    .optional()
    .describe(
      "transaction expiration in ms, up to 86400000 (24h); only with --sign-only or --build-only; omitted = node default (~60s)",
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

export const governanceTxModeFields = {
  ...txModeFields,
  ...tronTxModeFields,
  buildOnly: z
    .boolean()
    .default(false)
    .describe(
      "build an unsigned transaction without signing or broadcasting; mutually exclusive with --dry-run/--sign-only",
    ),
};

export function governanceTxRefine(
  value: { dryRun?: boolean; signOnly?: boolean; buildOnly?: boolean; expiration?: number },
  ctx: z.RefinementCtx,
): void {
  if ([value.dryRun, value.signOnly, value.buildOnly].filter(Boolean).length > 1) {
    ctx.addIssue({
      code: "custom",
      message: "choose at most one of --dry-run, --sign-only, --build-only",
    });
  }
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
  .refine((v) => !/^0+(\.0+)?$/.test(v), { message: "must be greater than zero" });

export function unifiedAmountFields(amountDesc: string, rawDesc: string) {
  return {
    amount: positiveDecimalAmount.optional().describe(amountDesc),
    rawAmount: Schemas.positiveIntString().optional().describe(rawDesc),
  };
}

export function amountSelector(
  v: { amount?: string; rawAmount?: string },
  ctx: z.RefinementCtx,
): void {
  const n = [v.amount !== undefined, v.rawAmount !== undefined].filter(Boolean).length;
  if (n !== 1)
    ctx.addIssue({
      code: "custom",
      path: ["amount"],
      message: "provide exactly one of --amount or --raw-amount",
      params: { errorCode: "invalid_option" },
    });
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
    return service.sign(ctx, net.family, ctx.activeAccount, message);
  },
});
