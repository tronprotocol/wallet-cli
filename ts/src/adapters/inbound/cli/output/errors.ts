// CLI projection of errors: the envelope and exit-code fallback.
import type { ExitCode } from "../../../../domain/types/primitives.js";
import { errorCodeEntry, type ErrorCodeTable } from "../../../../domain/errors/codes.js";
import { classifyError, CliError, UsageError } from "../../../../domain/errors/index.js";

export function errorEnvelope(err: CliError): { code: string; message: string; details?: object } {
  return err.details === undefined
    ? { code: err.code, message: err.message }
    : { code: err.code, message: err.message, details: err.details };
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
