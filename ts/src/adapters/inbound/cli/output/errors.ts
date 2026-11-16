// CLI projection of errors: flag and command spelling, the envelope, and exit-code fallback.
import type { ExitCode } from "../../../../domain/types/primitives.js";
import { errorCodeEntry, type ErrorCodeTable } from "../../../../domain/errors/codes.js";
import {
  classifyError,
  CliError,
  renderMessageParts,
  UsageError,
  type FollowUp,
  type FollowUpRef,
  type InputRef,
  type UserMessage,
} from "../../../../domain/errors/index.js";
import { camelToKebab } from "../arity/index.js";
import { GLOBAL_FLAG_SPECS } from "../globals/index.js";

const FOLLOW_UP_COMMANDS: Record<FollowUp, (subject: string | undefined) => string> = {
  "account-list": () => "list",
  "account-rename": (account) => `rename ${account ?? "<account>"} --label <new>`,
  "asset-info": (name) => `asset info ${name ?? "<name>"}`,
  "keystore-backup": (account) =>
    `wallet-cli backup ${account ?? "<account>"} --keystore --network tron:728126428 --password-stdin`,
  "ledger-import": () => "import ledger",
  "proposal-list": () => "proposal list",
  "token-add": (contract) =>
    contract === undefined ? "wallet-cli token add" : `wallet-cli token add --contract ${contract}`,
};

type Spelling = (subject: string | undefined) => string;

export function followUpSpelling(step: string): Spelling | undefined {
  return Object.hasOwn(FOLLOW_UP_COMMANDS, step) ? FOLLOW_UP_COMMANDS[step as FollowUp] : undefined;
}

// The core follow-up steps plus the steps the plugins of one runtime registered.
export class FollowUpTable {
  readonly #registered = new Map<string, Spelling>();

  spelling(step: string): Spelling | undefined {
    return followUpSpelling(step) ?? this.#registered.get(step);
  }

  // A step that already has a spelling keeps it.
  register(steps: Readonly<Record<string, (subject?: string) => string>>): void {
    for (const [step, spell] of Object.entries(steps)) {
      if (this.spelling(step) === undefined) this.#registered.set(step, spell);
    }
  }
}

const CORE_FOLLOW_UPS = new FollowUpTable();

export function flagFor(field: string): string {
  const global = GLOBAL_FLAG_SPECS.find((spec) => spec.field === field);
  return `--${global ? global.name : camelToKebab(field)}`;
}

// The message as the CLI shows it: JSON keeps raw values, text escapes them.
export function cliMessage(
  message: UserMessage,
  followUps: FollowUpTable = CORE_FOLLOW_UPS,
): { message: string; textMessage: string } {
  if (message.parts === undefined || message.parts.length === 0) {
    return { message: message.message, textMessage: message.textMessage };
  }
  const spell = (ref: InputRef | FollowUpRef): string => {
    if ("input" in ref) return flagFor(ref.input);
    const spelling = followUps.spelling(ref.followUp);
    if (spelling) return spelling(ref.subject);
    return ref.subject === undefined ? ref.followUp : `${ref.followUp} ${ref.subject}`;
  };
  return {
    message: renderMessageParts(message.parts, spell, false),
    textMessage: renderMessageParts(message.parts, spell, true),
  };
}

export function errorEnvelope(
  err: CliError,
  followUps?: FollowUpTable,
): { code: string; message: string; details?: object } {
  const { message } = cliMessage(err.userMessage, followUps);
  return err.details === undefined
    ? { code: err.code, message }
    : { code: err.code, message, details: err.details };
}

// The registry sets the exit code; unknown or "either" entries fall back to the class.
export function exitCodeOf(err: CliError, codes?: ErrorCodeTable): ExitCode {
  const declared = (codes ? codes.entry(err.code) : errorCodeEntry(err.code))?.exit;
  if (declared === 1 || declared === 2) return declared;
  return err.kind === "usage" ? 2 : 1;
}

const YARGS_USAGE =
  /Not enough non-option arguments|Missing required argument|Unknown argument|Invalid values|Did you mean|Not enough arguments|Too many non-option/i;

// Parser failures are usage errors; everything else follows the domain classification.
export function normalizeCliError(e: unknown): CliError {
  if (!(e instanceof CliError) && e instanceof Error && YARGS_USAGE.test(e.message)) {
    return new UsageError("usage_error", e.message);
  }
  return classifyError(e);
}
