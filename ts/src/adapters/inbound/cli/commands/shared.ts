/**
 * Shared chain-command factories — only for commands whose intent and input shape are
 * identical across families. Divergent commands (for example send-native,
 * with chain-specific amount units + build/estimate) live explicitly in each chain module.
 */
import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import { Schemas } from "../schemas/index.js";
import { TextFormatters } from "../render/index.js";
import type { MessageService } from "../../../../application/use-cases/message-service.js";

// ── execution-mode flags shared by every signing command ─────────────────────────
/** dry-run / sign-only fields; default (no flag) = sign AND broadcast on-chain. */
export const txModeFields = {
  dryRun: z.boolean().default(false).describe("build and estimate only, with no signature and no broadcast; mutually exclusive with --sign-only"),
  signOnly: z.boolean().default(false).describe("sign and output the transaction without broadcasting; mutually exclusive with --dry-run; broadcast later with tx broadcast"),
};

/** Full transaction controls required by governance/administrative writes. */
export const governanceTxModeFields = {
  ...txModeFields,
  buildOnly: z.boolean().default(false)
    .describe("build an unsigned transaction without signing or broadcasting; mutually exclusive with --dry-run/--sign-only"),
  expiration: z.coerce.number().int().positive().max(86_400_000).optional()
    .describe("extend transaction expiration in milliseconds (max 86400000); only with --sign-only or --build-only"),
  permissionId: z.coerce.number().int().min(0).max(2_147_483_647).default(0)
    .describe("TRON permission group used by the transaction (0 = owner)"),
};

export function governanceTxRefine(
  value: { dryRun?: boolean; signOnly?: boolean; buildOnly?: boolean; expiration?: number },
  ctx: z.RefinementCtx,
): void {
  if ([value.dryRun, value.signOnly, value.buildOnly].filter(Boolean).length > 1) {
    ctx.addIssue({ code: "custom", message: "choose at most one of --dry-run, --sign-only, --build-only" });
  }
  if (value.expiration !== undefined && !value.signOnly && !value.buildOnly) {
    ctx.addIssue({ code: "custom", path: ["expiration"], message: "only valid with --sign-only or --build-only" });
  }
}
// ── unified --amount / --raw-amount selector (shared by every chain's `tx send`) ────
// A transfer of 0 is meaningless on any chain — reject it here (exit 2) rather than let the node
// reject it with an opaque error. regex-based zero check (never BigInt): zod v4 keeps running
// refinements after the regex fails, so a throwing check would escape safeParse.
const positiveDecimalAmount = z.string()
  .regex(/^\d+(\.\d+)?$/, "must be a non-negative decimal string")
  .refine((v) => !/^0+(\.0+)?$/.test(v), { message: "must be greater than zero" });

/** the `--amount`/`--raw-amount` field pair; descriptions vary per chain (units differ). */
export function unifiedAmountFields(amountDesc: string, rawDesc: string) {
  return {
    amount: positiveDecimalAmount.optional().describe(amountDesc),
    rawAmount: Schemas.positiveIntString().optional().describe(rawDesc),
  };
}

/** superRefine: exactly one of --amount or --raw-amount must be present. */
export function amountSelector(v: { amount?: string; rawAmount?: string }, ctx: z.RefinementCtx): void {
  const n = [v.amount !== undefined, v.rawAmount !== undefined].filter(Boolean).length;
  if (n !== 1) ctx.addIssue({ code: "custom", path: ["amount"], message: "provide exactly one of --amount or --raw-amount" });
}

const messageSignFields = z.object({
  message: z.string().min(1).optional().describe("message text to sign; provide this OR --message-stdin; exactly one is required"),
});

export const messageSignSpec: ChainSpec = {
  path: ["message", "sign"],
  stdin: "message",
  network: "optional",
  wallet: "optional",
  auth: "required",
  capability: "message.sign",
  summary: "Sign an arbitrary message (TIP-191/V2 · EIP-191)",
  baseFields: messageSignFields,
  examples: [{ cmd: `wallet-cli message sign --message "hello"` }],
  formatText: TextFormatters.messageSign,
};

export const messageSignBinding = (service: MessageService): FamilyBinding => ({
  run: async (ctx, net, input) => {
    const message = ctx.secrets.pick(input.message, "message", "message");
    return service.sign(ctx, net.family, ctx.activeAccount, message);
  },
});
