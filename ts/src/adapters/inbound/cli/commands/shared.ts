import { z } from "zod";
import type { ChainSpec, ExclusiveGroup, FamilyBinding } from "../contracts/index.js";
import { Schemas } from "../schemas/index.js";
import { TextFormatters } from "../render/index.js";
import type { MessageService } from "../../../../application/use-cases/message-service.js";
import { isZeroAmount } from "../../../../domain/amounts/index.js";
import { tronTxModeFields, txModeExclusive, txModeFields } from "./tx-mode-fields.js";

export { tronTxModeFields, txModeExclusive, txModeFields };

export const LEDGER_TRON_SETTINGS_NOTE =
  'Ledger: enable "Custom contracts" and "Sign by Hash" in the TRON app settings.\n';

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
