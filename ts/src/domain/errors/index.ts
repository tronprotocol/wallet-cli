/**
 * Errors — typed CLI errors with exit-code semantics.
 *   usage  → exit 2
 *   execution → exit 1
 */
import type { ExitCode } from "../types/primitives.js";
import { ERROR_CODES, type ErrorCodeEntry } from "./codes.js";

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
  /**
   * The exit code comes from the CODE, not from the class this was thrown as.
   *
   * The class stays as the author's statement of intent — `error-codes.test.ts` fails the build
   * when the two disagree — but it no longer decides the contract. Before this, `new
   * ChainError("invalid_option", …)` silently shipped a usage error at exit 1, and nothing could
   * see it. `either` is the documented escape hatch for the few codes that genuinely arise on
   * both sides; an unknown code (there should be none — the registry test forbids it) also falls
   * back to the class rather than guessing.
   */
  exitCode(): ExitCode {
    // ERROR_CODES is `as const`, so its keys are a literal union and `this.code` (a plain string)
    // cannot index it directly. Widening at the lookup keeps the literal keys for `ErrorCode`.
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

const YARGS_USAGE =
  /Not enough non-option arguments|Missing required argument|Unknown argument|Invalid values|Did you mean|Not enough arguments|Too many non-option/i;

/**
 * classify — the "classify" half of the classify↔render split. Coerces any thrown value from the
 * stack (zod/yargs/tronweb/AbortController) into a canonical CliError whose `code` is the
 * single source feeding exit code + JSON `error.code` + human message (render half:
 * CliError.exitCode/toEnvelope). Unexpected exceptions are REDACTED to a generic message so a
 * library exception that happens to echo a secret can never reach the result envelope.
 */
export function classifyError(e: unknown): CliError {
  if (e instanceof CliError) return e;
  if (e instanceof Error && e.name === "AbortError") {
    return new ChainError(
      "timeout",
      "operation aborted (timed out waiting for the device or network)",
    );
  }
  if (e instanceof Error && YARGS_USAGE.test(e.message)) {
    return new UsageError("usage_error", e.message); // yargs usage text contains no secrets
  }
  return new ExecutionError("internal_error", "an unexpected internal error occurred");
}

/** The single funnel used by Runner/CliShell. Delegates to classifyError (no extra context). */
export function normalizeError(e: unknown): CliError {
  return classifyError(e);
}
