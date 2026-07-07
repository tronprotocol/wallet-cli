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

interface CommandDefinitionBase<I, O> {
  /** full typed path (e.g. ["import","mnemonic"], ["config","get"], ["create"]).
   * The stable identity (envelope `command` field) is derived from command metadata, not stored. */
  path: string[];
  /** declares the command reads from a *-stdin channel; drives help/catalog input-flag docs. */
  stdin?: StdinChannel;
  wallet: WalletRequirement;
  auth: AuthRequirement;
  /** broadcasts a transaction on-chain (✍️); enables the --wait global flag in help projection. */
  broadcasts?: boolean;
  /** opt-in interactive master-password handling: "establish" = set on first wallet else verify; "verify" = require existing. Commands without this keep the lazy hasMasterPassword guard. */
  passwordMode?: "establish" | "verify";
  /** expose one or more `fields` entries as leading positionals (`block [<number>]`, `use [<account>]`,
   *  `config [<key>] [<value>]`) instead of --flags: binds the CLI positionals in order, and help
   *  documents them under Args + Usage and drops them from the Flags list. `placeholder` defaults to `field`. */
  positionals?: { field: string; placeholder?: string }[];
  /** allow interactive TTY prompts (master password, secret, gap-fill, confirm). Absent ⇒ fail fast — safer for scripts/agents. */
  interactive?: boolean;
  /** gap-fill prompt hints, by field name: "skip" = never prompt this optional field; "default-label" = offer a generated default. */
  promptHints?: Record<string, "skip" | "default-label">;
  capability?: string;
  summary?: string;
  /** extra command-specific preconditions rendered in the help "Requires:" block, ahead of the
   *  auto-derived network/auth/account lines (e.g. a connected Ledger for `import ledger`). */
  requires?: string[];
  /** per-field zod object; feeds the arity adapter + HelpService. */
  fields: ZodObject<ZodRawShape>;
  /** full validation schema (often fields.superRefine), used in dispatch. */
  input: ZodType<I>;
  examples: Example[];
  /** Optional command-specific renderer for text mode. JSON mode always uses the envelope. */
  formatText?: TextFormatter<O>;
}

/** A neutral (family-less) command — wallet/config/meta operations that never receive a
 *  chain target. Networked commands are ChainCommandDefinitions. */
export interface CommandDefinition<I = any, O = any> extends CommandDefinitionBase<I, O> {
  network: "none";
  run(ctx: ExecutionContext, net: undefined, input: I): Promise<O>;
}

/** One family's slice of a chain command: how it runs + its extra flags/validation.
 *  It does NOT render — rendering is shared on the spec (Model P). O is the shared View type. */
export interface FamilyBinding<I = any, O = any> {
  run(ctx: ExecutionContext, net: NetworkDescriptor, input: I): Promise<O>;
  /** family-specific extra flags merged onto ChainSpec.baseFields; omit when none. */
  fields?: ZodObject<ZodRawShape>;
  /** family-specific cross-field validation; composed after ChainSpec.baseRefine. */
  refine?: (value: any, ctx: import("zod").RefinementCtx) => void;
}

/** Neutral, service-free declaration of a logical chain command. Generic over O, the single
 *  family-agnostic View every family's run returns. */
export interface ChainSpec<I = any, O = any> {
  path: string[];
  network: Exclude<NetworkRequirement, "none">;
  wallet: WalletRequirement;
  auth: AuthRequirement;
  broadcasts?: boolean;
  capability?: string;
  stdin?: StdinChannel;
  interactive?: boolean;
  passwordMode?: "establish" | "verify";
  positionals?: { field: string; placeholder?: string }[];
  promptHints?: Record<string, "skip" | "default-label">;
  requires?: string[];
  summary?: string;
  examples: Example[];
  baseFields: ZodObject<ZodRawShape>;
  baseRefine?: (value: any, ctx: import("zod").RefinementCtx) => void;
  /** shared text renderer; uses FAMILY_RENDER[net.family] for family-shaped rows. */
  formatText?: TextFormatter<O>;
}

/** Assembled command held by the registry: one spec + a family→binding table. */
export interface ChainCommandDefinition<I = any, O = any> {
  spec: ChainSpec<I, O>;
  families: Partial<Record<ChainFamily, FamilyBinding<I, O>>>;
}

/** Narrow structural command view shared by legacy definitions and assembled chain specs. */
export type CommandExecutionSpec = Pick<
  ChainSpec,
  | "path"
  | "network"
  | "wallet"
  | "auth"
  | "broadcasts"
  | "capability"
  | "interactive"
  | "passwordMode"
  | "positionals"
  | "promptHints"
  | "requires"
> & {
  fields: ZodObject<ZodRawShape>;
};

/** The registry stores either the legacy per-family CommandDefinition or the new one. */
export type StoredCommand = CommandDefinition | ChainCommandDefinition;

/** discriminates the two stored shapes. */
export function isChainCommand(c: StoredCommand): c is ChainCommandDefinition {
  return (c as ChainCommandDefinition).families !== undefined;
}
