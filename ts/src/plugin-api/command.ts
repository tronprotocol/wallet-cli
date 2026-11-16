import type { ZodObject, ZodRawShape, RefinementCtx } from "zod";
import type { NetworkDescriptor, OutputMode } from "../domain/types/index.js";
import type { TransactionScope } from "../application/contracts/execution-scope.js";
import type { ChainSpec, CommandDefinition } from "../adapters/inbound/cli/contracts/command.js";

export type DiagnosticLevel = "info" | "debug" | "warn";

// What a plugin command receives; it carries no secret, stream or prompt.
export interface PluginCommandContext extends TransactionScope {
  readonly output: OutputMode;
  // The command's time limit as resolved at start; 0 means none.
  readonly timeoutMs: number;
  // The non-secret stdin payload, read once; refused when stdin carries a secret. `input` names the
  // option that reads stdin in that refusal.
  readStdinBytes(input?: string): Promise<Uint8Array>;
  readonly log: {
    // A line on stderr.
    line(text: string): void;
    diagnostic(level: DiagnosticLevel, text: string): void;
  };
}

// Fields of core command definitions that belong to wallet management.
export const WALLET_MANAGEMENT_FIELDS = [
  "passwordMode",
  "secretsTtyOnly",
  "interactive",
  "promptHints",
  "skipGapFill",
] as const;

type WalletManagementField = (typeof WALLET_MANAGEMENT_FIELDS)[number];

export type PluginChainSpec<I = any, O = any> = Omit<ChainSpec<I, O>, WalletManagementField>;

export interface PluginFamilyBinding<I = any, O = any> {
  run(ctx: PluginCommandContext, net: NetworkDescriptor, input: I): Promise<O>;
  // Extra fields merged onto baseFields.
  fields?: ZodObject<ZodRawShape>;
  // Runs after baseRefine.
  refine?: (value: any, ctx: RefinementCtx) => void;
}

export interface PluginCommand<I = any, O = any> extends Omit<
  CommandDefinition<I, O>,
  WalletManagementField | "run"
> {
  run(ctx: PluginCommandContext, net: NetworkDescriptor | undefined, input: I): Promise<O>;
}
