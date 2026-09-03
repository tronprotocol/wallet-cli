/**
 * Broadcast guard — the structural backstop behind `--dry-run`.
 *
 * `--dry-run` is declared once, on a command's shared spec, but honoured separately by each
 * family binding. Nothing in the type system notices a binding that parses the flag and then
 * forwards only the fields it cares about, so a family can silently broadcast under a flag whose
 * documented promise is that it will not. That is not hypothetical: the EVM `tx broadcast`
 * binding dropped `dryRun` and submitted real transactions.
 *
 * So the promise is enforced where it can actually be kept: the shell bars broadcasting for the
 * duration of a dry run, and every Broadcaster implementation asks before it reaches the wire.
 * A binding that forgets the flag now fails loudly on a bug-report error instead of spending
 * someone's funds. The bar is process-wide because one CLI invocation runs one command; it is an
 * assertion about a mistake, never a control-flow mechanism a command should rely on.
 */
import { ExecutionError } from "../../domain/errors/index.js";

let barred: string | undefined;

/** Run `fn` with broadcasting barred. `reason` names the caller, for the bug report. */
export async function barBroadcasts<T>(reason: string, fn: () => Promise<T>): Promise<T> {
  barred = reason;
  try {
    return await fn();
  } finally {
    barred = undefined;
  }
}

/** Called by every Broadcaster before it submits. Throws when a dry run reached the wire. */
export function assertBroadcastAllowed(): void {
  if (barred === undefined) return;
  throw new ExecutionError(
    "dry_run_violation",
    `${barred} reached the broadcast path; nothing was submitted. This is a bug in the command's family binding, not in your input — please report it.`,
  );
}
