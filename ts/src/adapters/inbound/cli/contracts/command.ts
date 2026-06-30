/** CLI command metadata, validation, rendering and registration contracts. */
import type { ZodObject, ZodRawShape, ZodType } from "zod";
import type { ChainFamily } from "../../../../domain/family/index.js";
import type { NetworkDescriptor } from "../../../../domain/types/network.js";
import type { NetworkRequirement, WalletRequirement } from "../../../../application/contracts/index.js";
import type { ExecutionContext } from "./execution-context.js";

export interface Example {
  cmd: string;
  note?: string;
}

// "optional" = the command operates on an account; --account is optional and falls back to the
// active account (errors only if no account exists at all). "none" = never touches an account.
// (No "required": no command forces --account — active is always a valid default. cf. network.)
// "required" = unlocks the master password (sign / read secrets / encrypt);
// "none" = never unlocks. (No middle state — a command either needs the password or it doesn't.)
export type AuthRequirement = "none" | "required";

/** secret/payload channel a command reads from stdin; documents the matching --*-stdin flag. */
export type StdinChannel = "privateKey" | "mnemonic" | "tx" | "message";

export interface TextRenderContext {
  command: string;
  net?: NetworkDescriptor;
  /** label of the resolved active account, injected centrally; absent for wallet:"none" commands. */
  accountLabel?: string;
}

export type TextFormatter<O = unknown> = (data: O, ctx: TextRenderContext) => string | null;

export interface CommandDefinition<I = any, O = any> {
  /** full typed path. Neutral commands carry their complete path (e.g. ["import","mnemonic"],
   *  ["config","get"], ["create"]); chain commands carry the logical path (e.g. ["tx","send"])
   *  shared across families. The only routing discriminator is `family` present/absent.
   * The stable identity (envelope `command` field) is derived from command metadata, not stored. */
  path: string[];
  family?: ChainFamily;
  /** declares the command reads from a *-stdin channel; drives help/catalog input-flag docs. */
  stdin?: StdinChannel;
  network: NetworkRequirement;
  wallet: WalletRequirement;
  auth: AuthRequirement;
  /** broadcasts a transaction on-chain (✍️); enables the --wait global flag in help projection. */
  broadcasts?: boolean;
  /** opt-in interactive master-password handling: "establish" = set on first wallet else verify; "verify" = require existing. Commands without this keep the lazy hasMasterPassword guard. */
  passwordMode?: "establish" | "verify";
  /** bind an `[account]` positional on the CLI surface (account-targeting neutral leaves: use/rename/backup/delete). */
  positionalAccount?: boolean;
  /** allow interactive TTY prompts (master password, secret, gap-fill, confirm). Absent ⇒ fail fast — safer for scripts/agents. */
  interactive?: boolean;
  /** gap-fill prompt hints, by field name: "skip" = never prompt this optional field; "default-label" = offer a generated default. */
  promptHints?: Record<string, "skip" | "default-label">;
  capability?: string;
  summary?: string;
  /** per-field zod object; feeds the arity adapter + HelpService. */
  fields: ZodObject<ZodRawShape>;
  /** full validation schema (often fields.superRefine), used in dispatch. */
  input: ZodType<I>;
  examples: Example[];
  run(ctx: ExecutionContext, net: NetworkDescriptor | undefined, input: I): Promise<O>;
  /** Optional command-specific renderer for text mode. JSON mode always uses the envelope. */
  formatText?: TextFormatter<O>;
}

export interface ChainModule {
  family: ChainFamily;
  registerCommands(reg: CommandRegistryLike): void;
}

/** structural view of CommandRegistry needed by ChainModule.registerCommands. */
export interface CommandRegistryLike {
  add(cmd: CommandDefinition): void;
}
