/**
 * Errors (L0) — typed CLI errors with exit-code semantics (plan §7.8).
 *   usage  → exit 2
 *   execution → exit 1
 */
import type { ExitCode } from "../types/index.js";

export abstract class CliError extends Error {
  abstract readonly kind: "usage" | "execution";
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: object,
  ) {
    super(message);
    this.name = new.target.name;
  }
  exitCode(): ExitCode {
    return this.kind === "usage" ? 2 : 1;
  }
  toEnvelope(): { code: string; message: string; details?: object } {
    return this.details === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, details: this.details };
  }
}

/** exit 2 — bad flags, missing required, invalid command shape, family mismatch. */
export class UsageError extends CliError {
  readonly kind = "usage" as const;
}

/** exit 1 — runtime failures. */
export class ExecutionError extends CliError {
  readonly kind = "execution" as const;
}
export class TransportError extends ExecutionError {}
export class ChainError extends ExecutionError {}
export class WalletError extends ExecutionError {}

const YARGS_USAGE = /Not enough non-option arguments|Missing required argument|Unknown argument|Invalid values|Did you mean|Not enough arguments|Too many non-option/i;

/**
 * Coerce any thrown value into a CliError (the single funnel in Runner/CliShell).
 * Unexpected (non-CliError) exceptions are REDACTED to a generic message so a library
 * exception that happens to echo a secret can never reach the result envelope. The raw
 * error is surfaced to stderr under --verbose by the Runner.
 */
export function normalizeError(e: unknown): CliError {
  if (e instanceof CliError) return e;
  if (e instanceof Error && YARGS_USAGE.test(e.message)) {
    return new UsageError("usage_error", e.message); // yargs usage text contains no secrets
  }
  return new ExecutionError("internal_error", "an unexpected internal error occurred");
}
