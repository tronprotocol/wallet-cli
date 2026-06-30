/**
 * Shared chain-command factories — only for commands whose intent and input shape are
 * identical across families. Divergent commands (for example send-native,
 * with chain-specific amount units + build/estimate) live explicitly in each chain module.
 */
import { z } from "zod";
import type { ChainFamily } from "../../../../domain/types/index.js";
import type { CommandDefinition } from "../contracts/index.js";
import { Schemas } from "../schemas/index.js";
import { TextFormatters } from "../render/index.js";
import type { MessageService } from "../../../../application/use-cases/message-service.js";

// ── execution-mode flags shared by every signing command ─────────────────────────
/** dry-run / sign-only fields; default (no flag) = sign AND broadcast on-chain. */
export const txModeFields = {
  dryRun: z.boolean().default(false).describe("build and estimate only, with no signature and no broadcast; mutually exclusive with --sign-only"),
  signOnly: z.boolean().default(false).describe("sign and output the transaction without broadcasting; mutually exclusive with --dry-run; broadcast later with tx broadcast"),
};
// ── unified --amount / --raw-amount selector (shared by every chain's `tx send`) ────
const decimalAmount = z.string().regex(/^\d+(\.\d+)?$/, "must be a non-negative decimal string");

/** the `--amount`/`--raw-amount` field pair; descriptions vary per chain (units differ). */
export function unifiedAmountFields(amountDesc: string, rawDesc: string) {
  return {
    amount: decimalAmount.optional().describe(amountDesc),
    rawAmount: Schemas.uintString().optional().describe(rawDesc),
  };
}

/** superRefine: exactly one of --amount or --raw-amount must be present. */
export function amountSelector(v: { amount?: string; rawAmount?: string }, ctx: z.RefinementCtx): void {
  const n = [v.amount !== undefined, v.rawAmount !== undefined].filter(Boolean).length;
  if (n !== 1) ctx.addIssue({ code: "custom", path: ["amount"], message: "provide exactly one of --amount or --raw-amount" });
}

/** message sign — direct SignerResolver path (no node, no TxPipeline). */
export function messageSignCommand(family: ChainFamily, service: MessageService): CommandDefinition {
  // --message OR --message-stdin (the latter is a global data channel via SecretResolver).
  const fields = z.object({
    message: z.string().min(1).optional().describe("message text to sign; provide this OR --message-stdin; exactly one is required"),
  });
  return {
    path: ["message", "sign"],
    stdin: "message",
    family,
    network: "optional",
    wallet: "optional",
    auth: "required",
    capability: "message.sign",
    summary: "sign an arbitrary message (TIP-191/V2 · EIP-191)",
    fields,
    input: fields,
    examples: [{ cmd: `wallet-cli message sign --network ${family === "tron" ? "nile" : "eth"} --message "hello"` }],
    formatText: TextFormatters.messageSign,
    run: async (ctx, _net, input) => {
      const message = ctx.secrets.pick(input.message, "message", "message");
      return service.sign(family, ctx.activeAccount, message);
    },
  };
}
