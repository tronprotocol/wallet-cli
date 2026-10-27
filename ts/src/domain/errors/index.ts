import type { ExitCode } from "../types/primitives.js";
import { ERROR_CODES, type ErrorCodeEntry } from "./codes.js";

// Separates trusted layout from escaped external values.
interface ErrorMessage {
  readonly message: string;
  readonly textMessage: string;
}

// Escapes line separators before composing text output.
export function singleLineErrorValue(value: string): string {
  return value.replace(/[\n\r\u0085\u2028\u2029]/g, (char) => {
    if (char === "\n") return "\\n";
    if (char === "\r") return "\\r";
    return `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
  });
}

// Escapes interpolated line separators for text output; preserves raw values for JSON.
export function errorMessage(strings: TemplateStringsArray, ...values: unknown[]): ErrorMessage {
  let message = strings[0]!;
  let textMessage = message;
  for (const [index, value] of values.entries()) {
    const raw = String(value);
    const literal = strings[index + 1]!;
    message += raw + literal;
    textMessage += singleLineErrorValue(raw) + literal;
  }
  return { message, textMessage };
}

export abstract class CliError extends Error {
  abstract readonly kind: "usage" | "execution";
  readonly textMessage: string;
  constructor(
    public readonly code: string,
    message: string | ErrorMessage,
    public readonly details?: object,
  ) {
    super(typeof message === "string" ? message : message.message);
    this.textMessage = typeof message === "string" ? message : message.textMessage;
    this.name = new.target.name;
  }
  // The registry sets the exit code; unknown or "either" entries fall back to the class.
  exitCode(): ExitCode {
    const table = ERROR_CODES as Record<string, ErrorCodeEntry | undefined>;
    const declared = table[this.code]?.exit;
    if (declared === 1 || declared === 2) return declared;
    return this.kind === "usage" ? 2 : 1;
  }
  toEnvelope(): { code: string; message: string; details?: object } {
    return this.details === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, details: this.details };
  }
}

export class UsageError extends CliError {
  readonly kind = "usage" as const;
}

export class ExecutionError extends CliError {
  readonly kind = "execution" as const;
}
export class TransportError extends ExecutionError {}
export class ChainError extends ExecutionError {}
export class WalletError extends ExecutionError {}

const YARGS_USAGE =
  /Not enough non-option arguments|Missing required argument|Unknown argument|Invalid values|Did you mean|Not enough arguments|Too many non-option/i;

// Redact unrecognized errors so library messages cannot expose secrets.
export function classifyError(e: unknown): CliError {
  if (e instanceof CliError) return e;
  if (e instanceof Error && e.name === "AbortError") {
    return new ChainError(
      "timeout",
      "operation aborted (timed out waiting for the device or network)",
    );
  }
  if (e instanceof Error && YARGS_USAGE.test(e.message)) {
    return new UsageError("usage_error", e.message);
  }
  return new ExecutionError("internal_error", "an unexpected internal error occurred");
}

export function normalizeError(e: unknown): CliError {
  return classifyError(e);
}
