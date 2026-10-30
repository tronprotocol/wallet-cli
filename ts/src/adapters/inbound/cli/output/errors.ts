// CLI projection of errors: flag and command spelling, the envelope, and exit-code fallback.
import type { ExitCode } from "../../../../domain/types/primitives.js";
import { ERROR_CODES, type ErrorCodeEntry } from "../../../../domain/errors/codes.js";
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
  "asset-info": (name) => `asset info ${name ?? "<name>"}`,
  "bai-report-recharge": () => "bai report-recharge",
  "gasfree-trace": (id) => (id === undefined ? "gasfree trace" : `gasfree trace ${id}`),
  "keystore-backup": (account) =>
    `wallet-cli backup ${account ?? "<account>"} --keystore --network tron:728126428 --password-stdin`,
  "proposal-list": () => "proposal list",
  "sunswap-pool-list-v4": () => "sunswap pool-list --protocol V4",
  "sunswap-position-list": () => "sunswap position-list",
  "sunswap-swap": () => "sunswap swap",
  "token-add": (contract) =>
    contract === undefined ? "wallet-cli token add" : `wallet-cli token add --contract ${contract}`,
};

export function flagFor(field: string): string {
  const global = GLOBAL_FLAG_SPECS.find((spec) => spec.field === field);
  return `--${global ? global.name : camelToKebab(field)}`;
}

function spell(ref: InputRef | FollowUpRef): string {
  return "input" in ref ? flagFor(ref.input) : FOLLOW_UP_COMMANDS[ref.followUp](ref.subject);
}

// The message as the CLI shows it: JSON keeps raw values, text escapes them.
export function cliMessage(message: UserMessage): { message: string; textMessage: string } {
  if (message.parts === undefined || message.parts.length === 0) {
    return { message: message.message, textMessage: message.textMessage };
  }
  return {
    message: renderMessageParts(message.parts, spell, false),
    textMessage: renderMessageParts(message.parts, spell, true),
  };
}

export function errorEnvelope(err: CliError): { code: string; message: string; details?: object } {
  const { message } = cliMessage(err.userMessage);
  return err.details === undefined
    ? { code: err.code, message }
    : { code: err.code, message, details: err.details };
}

// The registry sets the exit code; unknown or "either" entries fall back to the class.
export function exitCodeOf(err: CliError): ExitCode {
  const table = ERROR_CODES as Record<string, ErrorCodeEntry | undefined>;
  const declared = table[err.code]?.exit;
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
