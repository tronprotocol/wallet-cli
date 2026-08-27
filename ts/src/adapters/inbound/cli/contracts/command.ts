/** CLI command metadata, validation, rendering and registration contracts. */
import type { ZodObject, ZodRawShape, ZodType } from "zod";
import type { ChainFamily } from "../../../../domain/family/index.js";
import type { NetworkDescriptor } from "../../../../domain/types/network.js";
import type {
  NetworkRequirement,
  WalletRequirement,
} from "../../../../application/contracts/index.js";
import type { ExecutionContext } from "./execution-context.js";

export interface Example {
  cmd: string;
  note?: string;
}

/** a set of options of which exactly one must be supplied, enforced in the command's refine.
 *  Help renders it as a labelled block ("Exactly one of these — <label>:") instead of tagging every
 *  member "[optional]", which reads as "all of these may be omitted". `flags` are kebab flag names
 *  in the order they should be listed, and may include a `--*-stdin` channel flag (e.g. "tx-stdin"). */
export interface ExclusiveGroup {
  label: string;
  flags: string[];
  /** "exactly-one" (default): the set is jointly required, so members drop their "[optional]" tag.
   *  "at-most-one": omitting the whole set is valid (there is a default behaviour) — members really
   *  are optional and keep the tag; only picking two is rejected. */
  select?: "exactly-one" | "at-most-one";
}

// "optional" = the command operates on an account; --account is optional and falls back to the
// active account (errors only if no account exists at all). "none" = never touches an account.
// (No "required": no command forces --account — active is always a valid default. cf. network.)
// "required" = every execution needs the master password (sign / read secrets / encrypt);
// "conditional" = only selected execution modes need it; other modes run without a password;
// "none" = never needs it.
export type AuthRequirement = "none" | "conditional" | "required";

/** secret/payload channel a command reads from stdin; documents the matching --*-stdin flag.
 *  (Wallet-secret entry — mnemonic/private-key/master-password — is TTY-only, so those never
 *  appear here; see `secretsTtyOnly`.) */
export type StdinChannel = "tx" | "message";

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
  /** secrets are entered interactively ONLY (no stdin source): every `--*-stdin` secret flag,
   *  including the global `--password-stdin`, is rejected for this command and hidden from its help.
   *  Set on the ultra-sensitive setup ops (import mnemonic/private-key, change-password) — a human
   *  moment, no agent/CI path. Does NOT affect create/backup/signing commands. */
  secretsTtyOnly?: boolean;
  /** gap-fill prompt hints, by field name: "skip" = never prompt this optional field; "default-label" = offer a generated default. */
  promptHints?: Record<string, "skip" | "default-label">;
  /** fields that must not be gap-filled for THIS invocation, from raw argv. Use when a mode flag
   *  makes a field meaningless (`backup --records` exports nothing, so no account is asked for).
   *  Unlike `promptHints`, this is per-invocation rather than static. */
  skipGapFill?: (argv: Record<string, unknown>) => string[];
  capability?: string;
  /** one-line command listing text (parent group's verb list). Keep it terse — a single line. */
  summary?: string;
  /** optional fuller leaf-help description (may span multiple lines); shown on `<cmd> --help`
   *  instead of `summary` when present. Use it for commands whose behavior needs more than a
   *  headline (semantics, limits, warnings). Absent ⇒ leaf help falls back to `summary`. */
  description?: string;
  /** extra command-specific preconditions rendered in the help "Requires:" block, ahead of the
   *  auto-derived network/auth/account lines (e.g. a connected Ledger for `import ledger`). */
  requires?: string[];
  /** preconditions that must render AFTER the auto-derived master-password line rather than
   *  before it. §10.1 rule 4 orders same-class prerequisites by the order the user supplies
   *  them, and `change-password` asks for the current password before the new one — so its
   *  "new master password" line has to follow the generated one, not lead it. */
  requiresAfterAuth?: string[];
  /** mutually-exclusive option sets, surfaced in help; see ExclusiveGroup. */
  exclusive?: ExclusiveGroup[];
  /** per-field zod object; feeds the arity adapter + HelpService. */
  fields: ZodObject<ZodRawShape>;
  /** full validation schema (often fields.superRefine), used in dispatch. */
  input: ZodType<I>;
  examples: Example[];
  /** Optional command-specific renderer for text mode. JSON mode always uses the envelope. */
  formatText?: TextFormatter<O>;
  /** Override the envelope's `command` for a mode-switching command whose modes return different
   *  `data` shapes (`backup` vs `backup.records`). `command` names the SEMANTIC command, not how it
   *  was typed, so a reader can branch on it instead of sniffing fields. Absent ⇒ the path. */
  commandIdFor?: (input: I) => string;
}

/**
 * A neutral (family-less) command — wallet/config/meta operations that are not dispatched by
 * family. Networked *chain* commands are ChainCommandDefinitions.
 *
 * `network: "optional"` does not make it a chain command: it means the selected network is a
 * DISPLAY SELECTOR (which family's address to show), not a target to act on. No node is
 * contacted. Such a command must be `wallet: "none"`, or the target resolver's single-family
 * ACCOUNT check applies and it would refuse to run whenever the active account's family differs
 * from the network — wrong for a purely local listing.
 */
export interface CommandDefinition<I = any, O = any> extends CommandDefinitionBase<I, O> {
  network: "none" | "optional";
  run(ctx: ExecutionContext, net: NetworkDescriptor | undefined, input: I): Promise<O>;
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
export interface ChainSpec<_I = any, O = any> {
  path: string[];
  network: Exclude<NetworkRequirement, "none">;
  wallet: WalletRequirement;
  auth: AuthRequirement;
  broadcasts?: boolean;
  capability?: string;
  stdin?: StdinChannel;
  /** the stdin channel belongs to ONE family (e.g. `--tx-stdin` carries TRON's transaction JSON).
   *  Help tags the flag with it and every other family refuses it, the same way a flag declared in
   *  a single family's binding behaves — a channel no other family reads must say so. */
  stdinFamily?: ChainFamily;
  interactive?: boolean;
  passwordMode?: "establish" | "verify";
  positionals?: { field: string; placeholder?: string }[];
  promptHints?: Record<string, "skip" | "default-label">;
  requires?: string[];
  /** one-line command listing text (parent group's verb list). Keep it terse — a single line. */
  summary?: string;
  /** optional fuller leaf-help description (may span multiple lines); shown on `<cmd> --help`
   *  instead of `summary` when present. Absent ⇒ leaf help falls back to `summary`. */
  description?: string;
  examples: Example[];
  /** mutually-exclusive option sets, surfaced in help; see ExclusiveGroup. */
  exclusive?: ExclusiveGroup[];
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
