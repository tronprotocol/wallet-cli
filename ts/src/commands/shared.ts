/**
 * Shared chain-command factories (L4) — ONLY for commands whose intent AND input shape are
 * identical across families (rule of three; plan §3 L4). Divergent commands (e.g. send-native,
 * with chain-specific amount units + build/estimate) live explicitly in each chain module.
 */
import { z } from "zod";
import type { ChainFamily, CommandDefinition, TxOutcome } from "../core/types/index.js";
import type { Services } from "./services.js";
import { FAMILIES } from "../core/family/index.js";
import { UsageError } from "../core/errors/index.js";

const unitOf = (f: ChainFamily) => FAMILIES[f].nativeUnit;

// ── execution-mode flags shared by every signing command ─────────────────────────
/** dry-run / sign-only fields; default (no flag) = sign AND broadcast on-chain. */
export const txModeFields = {
  dryRun: z.boolean().default(false).describe("build and estimate only, with no signature and no broadcast; mutually exclusive with --sign-only"),
  signOnly: z.boolean().default(false).describe("sign and output the transaction without broadcasting; mutually exclusive with --dry-run; broadcast later with tx broadcast"),
};
export interface TxModeInput {
  dryRun?: boolean;
  signOnly?: boolean;
}
/** resolve the flags into the two TxPipeline knobs; absence ⇒ broadcast (default). */
export function txMode(input: TxModeInput): { dryRun: boolean; broadcast: boolean } {
  // --dry-run and --sign-only are mutually exclusive; combining them is a usage error.
  if (input.dryRun && input.signOnly) {
    throw new UsageError("invalid_option", "choose at most one of --dry-run, --sign-only");
  }
  if (input.dryRun) return { dryRun: true, broadcast: false };
  if (input.signOnly) return { dryRun: false, broadcast: false };
  return { dryRun: false, broadcast: true };
}
/** shape a TxOutcome into command output data. */
export function outcomeData(o: TxOutcome): Record<string, unknown> {
  if (o.stage === "plan") return { mode: "dry-run", fee: o.fee, tx: o.tx };
  if (o.stage === "signed") return { mode: "sign-only", signed: o.signed, fee: o.fee };
  return o as unknown as Record<string, unknown>;
}

/** account balance — read native balance of the active account (or --account). */
export function balanceCommand(family: ChainFamily): CommandDefinition {
  const fields = z.object({});
  return {
    id: `${family}.account.balance`,
    path: ["account", "balance"],
    family,
    network: "optional",
    wallet: "optional",
    auth: "none",
    capability: "account.balance.native",
    summary: `get native ${unitOf(family)} balance`,
    fields,
    input: fields,
    examples: [{ cmd: `wallet-cli ${family} account balance` }],
    run: async (ctx, net) => {
      const address = ctx.resolveAddress(family);
      const balance = await net!.rpc!.getNativeBalance(address);
      return { address, balance, unit: unitOf(family) };
    },
  };
}

/** message sign — direct SignerResolver path (no node, no TxPipeline). */
export function messageSignCommand(family: ChainFamily, services: Services): CommandDefinition {
  // --message OR --message-stdin (the latter is a global data channel via SecretResolver).
  const fields = z.object({
    message: z.string().min(1).optional().describe("message text to sign; provide this OR --message-stdin; exactly one is required"),
  });
  return {
    id: `${family}.message.sign`,
    path: ["message", "sign"],
    family,
    network: "optional",
    wallet: "optional",
    auth: "required",
    capability: "message.sign",
    summary: "sign an arbitrary message (TIP-191/V2 · EIP-191)",
    fields,
    input: fields,
    examples: [{ cmd: `wallet-cli ${family} message sign --message "hello"` }],
    run: async (ctx, _net, input) => {
      const message = ctx.secrets.pick(input.message, "message", "message");
      const signer = services.signerResolver.resolve(ctx.activeAccount, family);
      const signature = await signer.signMessage(message, {});
      return { address: signer.address, message, signature };
    },
  };
}
