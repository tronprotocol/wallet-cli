/**
 * Shared chain-command factories (L4) — ONLY for commands whose intent AND input shape are
 * identical across families (rule of three; plan §3 L4). Divergent commands (e.g. send-native,
 * with chain-specific amount units + build/estimate) live explicitly in each chain module.
 */
import { z } from "zod";
import type { ChainFamily, CommandDefinition, TxOutcome } from "../core/types/index.js";
import { Schemas } from "../infra/contract/index.js";
import type { Services } from "./services.js";
import { UsageError } from "../core/errors/index.js";

const unitOf = (f: ChainFamily) => (f === "tron" ? "sun" : "wei");
const sampleNet = (f: ChainFamily) => (f === "tron" ? "nile" : "base");

// ── execution-mode flags shared by every signing command (plan §6 二次確認) ──────
/** dry-run / broadcast / sign-only fields; default (no flag) = dry-run (safest). */
export const txModeFields = {
  dryRun: z.boolean().default(false).describe("build + estimate only — no sign, no broadcast (default mode)"),
  broadcast: z.boolean().default(false).describe("sign AND broadcast on-chain (high-risk; explicit opt-in)"),
  signOnly: z.boolean().default(false).describe("sign and output the tx, do not broadcast (feed tx broadcast)"),
};
export interface TxModeInput {
  dryRun?: boolean;
  broadcast?: boolean;
  signOnly?: boolean;
}
/** resolve the three flags into the two TxPipeline knobs; absence ⇒ dry-run. */
export function txMode(input: TxModeInput): { dryRun: boolean; broadcast: boolean } {
  // the three modes are mutually exclusive; e.g. `--dry-run --broadcast` must NOT silently
  // broadcast (the user asked for a dry run). Contradictory combos are a usage error (§6).
  if ([input.dryRun, input.broadcast, input.signOnly].filter(Boolean).length > 1) {
    throw new UsageError("invalid_option", "choose at most one of --dry-run, --broadcast, --sign-only");
  }
  if (input.broadcast) return { dryRun: false, broadcast: true };
  if (input.signOnly) return { dryRun: false, broadcast: false };
  return { dryRun: true, broadcast: false };
}
/** shape a TxOutcome into command output data. */
export function outcomeData(o: TxOutcome): Record<string, unknown> {
  if (o.stage === "plan") return { mode: "dry-run", fee: o.fee, tx: o.tx };
  if (o.stage === "signed") return { mode: "sign-only", signed: o.signed, fee: o.fee };
  return o as unknown as Record<string, unknown>;
}

/** account balance — read native balance of the active (or given) address. */
export function balanceCommand(family: ChainFamily): CommandDefinition {
  const fields = z.object({
    address: Schemas.addressFor(family).optional().describe("target address (default: active account)"),
  });
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
    examples: [{ cmd: `wallet-cli ${family} account balance --network ${sampleNet(family)}` }],
    run: async (ctx, net, input) => {
      const address = input.address ?? ctx.resolveAddress(family);
      const balance = await net!.rpc!.getNativeBalance(address);
      return { address, balance, unit: unitOf(family) };
    },
  };
}

/** message sign — direct SignerResolver path (no node, no TxPipeline). */
export function messageSignCommand(family: ChainFamily, services: Services): CommandDefinition {
  // --message OR --message-file (the latter is a global data channel via SecretResolver).
  const fields = z.object({
    message: z.string().min(1).optional().describe("message to sign (or use --message-file)"),
  });
  return {
    id: `${family}.message.sign`,
    path: ["message", "sign"],
    family,
    network: "optional",
    wallet: "required",
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
