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

// The one declaration of options that exclude each other; validation, help, and --json-schema derive from it.
export interface ExclusiveGroup {
  label: string;
  // Kebab-case flag names without "--", in display order.
  flags: string[];
  // Defaults to exactly-one; at-most-one keeps members optional in help.
  select?: "exactly-one" | "at-most-one";
}

// Master password required for every execution, selected modes, or none.
export type AuthRequirement = "none" | "conditional" | "required";

// Payload or API-key channel documented by the matching --*-stdin flag.
export type StdinChannel = "tx" | "message" | "apiKey";

export interface TextRenderContext {
  command: string;
  net?: NetworkDescriptor;
  // Absent for commands with wallet: "none".
  accountLabel?: string;
}

export type TextFormatter<O = unknown> = (data: O, ctx: TextRenderContext) => string | null;

interface CommandDefinitionBase<I, O> {
  // The path supplies the default envelope command ID.
  path: string[];
  // Documents the matching --*-stdin flag.
  stdin?: StdinChannel;
  wallet: WalletRequirement;
  auth: AuthRequirement;
  // Enables --wait in help.
  broadcasts?: boolean;
  // Overrides waiting support for externally submitted payments.
  supportsWait?: boolean;
  // Establish sets the first password or verifies an existing one; verify requires one.
  passwordMode?: "establish" | "verify";
  // Leading positional fields, in order; placeholder defaults to the field name.
  positionals?: { field: string; placeholder?: string }[];
  // Absent means fail without interactive prompts.
  interactive?: boolean;
  // Reject and hide secret stdin flags, including --password-stdin.
  secretsTtyOnly?: boolean;
  // Skip optional prompts or offer a generated label, by field name.
  promptHints?: Record<string, "skip" | "default-label">;
  // Fields to omit from gap-fill for this invocation.
  skipGapFill?: (argv: Record<string, unknown>) => string[];
  capability?: string;
  // One-line entry in the parent command listing.
  summary?: string;
  // Leaf help uses this instead of summary when present.
  description?: string;
  // Help prerequisites shown before the derived network/auth/account requirements.
  requires?: string[];
  // Help prerequisites shown after the master-password requirement.
  requiresAfterAuth?: string[];
  exclusive?: ExclusiveGroup[];
  // Field schemas supply arity and help metadata.
  fields: ZodObject<ZodRawShape>;
  // Full validation schema, including cross-field refinements.
  input: ZodType<I>;
  examples: Example[];
  // JSON output always uses the envelope.
  formatText?: TextFormatter<O>;
  // Overrides the envelope command ID for modes with different result shapes.
  commandIdFor?: (input: I) => string;
}

// Local commands use an optional network only to select the displayed address family.
export interface CommandDefinition<I = any, O = any> extends CommandDefinitionBase<I, O> {
  network: "none" | "optional";
  run(ctx: ExecutionContext, net: NetworkDescriptor | undefined, input: I): Promise<O>;
}

// Family bindings share the spec's renderer and output type.
export interface FamilyBinding<I = any, O = any> {
  run(ctx: ExecutionContext, net: NetworkDescriptor, input: I): Promise<O>;
  // Extra fields merged onto baseFields.
  fields?: ZodObject<ZodRawShape>;
  // Runs after baseRefine.
  refine?: (value: any, ctx: import("zod").RefinementCtx) => void;
}

// All family bindings return the same output view.
export interface ChainSpec<_I = any, O = any> {
  path: string[];
  network: Exclude<NetworkRequirement, "none">;
  wallet: WalletRequirement;
  auth: AuthRequirement;
  broadcasts?: boolean;
  // Overrides waiting support for externally submitted payments.
  supportsWait?: boolean;
  capability?: string;
  // Reason to reject --account; wallet: "none" alone does not reject it.
  rejectsAccount?: string;
  // Reason to reject --wait.
  rejectsWait?: string;
  // Boolean mode field that disables waiting; schema refinements cannot see global flags.
  rejectsWaitWith?: string;
  stdin?: StdinChannel;
  // Only this family accepts the stdin channel.
  stdinFamily?: ChainFamily;
  interactive?: boolean;
  passwordMode?: "establish" | "verify";
  positionals?: { field: string; placeholder?: string }[];
  promptHints?: Record<string, "skip" | "default-label">;
  requires?: string[];
  // One-line entry in the parent command listing.
  summary?: string;
  // Leaf help uses this instead of summary when present.
  description?: string;
  examples: Example[];
  exclusive?: ExclusiveGroup[];
  baseFields: ZodObject<ZodRawShape>;
  baseRefine?: (value: any, ctx: import("zod").RefinementCtx) => void;
  formatText?: TextFormatter<O>;
}

export interface ChainCommandDefinition<I = any, O = any> {
  spec: ChainSpec<I, O>;
  families: Partial<Record<ChainFamily, FamilyBinding<I, O>>>;
}

export type CommandExecutionSpec = Pick<
  ChainSpec,
  | "path"
  | "network"
  | "wallet"
  | "auth"
  | "broadcasts"
  | "supportsWait"
  | "capability"
  | "rejectsAccount"
  | "rejectsWait"
  | "rejectsWaitWith"
  | "interactive"
  | "passwordMode"
  | "positionals"
  | "promptHints"
  | "requires"
> & {
  fields: ZodObject<ZodRawShape>;
};

export type StoredCommand = CommandDefinition | ChainCommandDefinition;

export function isChainCommand(c: StoredCommand): c is ChainCommandDefinition {
  return (c as ChainCommandDefinition).families !== undefined;
}
