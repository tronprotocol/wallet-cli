import { classifyError } from "../../domain/errors/index.js";
import { ERROR_CODES, type ErrorCodeEntry } from "../../domain/errors/codes.js";
import type { ExecutionDeadline } from "../contracts/deadline.js";
import { endedByDeadline, untilDeadline } from "./command-deadline.js";

const POLL_INTERVAL_MS = 1500;

// Polls until `attempt` yields a value; undefined once the deadline expires. No attempt starts after
// expiry, and without a limit it polls indefinitely. An error whose retry class lets the same request
// succeed later counts as "not yet"; any other error is rethrown, so it cannot poll until the deadline.
export async function pollUntilDeadline<T>(
  deadline: ExecutionDeadline,
  attempt: (signal: AbortSignal) => Promise<T | undefined>,
): Promise<T | undefined> {
  for (;;) {
    if (deadline.expired()) return undefined;
    const result = await untilDeadline(attempt(deadline.signal), deadline).catch((error) => {
      if (endedByDeadline(error, deadline) || retriesUnchanged(error)) return undefined;
      throw error;
    });
    if (result !== undefined) return result;
    if (!(await sleepWithin(deadline, POLL_INTERVAL_MS))) return undefined;
  }
}

function retriesUnchanged(error: unknown): boolean {
  const retry = (ERROR_CODES as Record<string, ErrorCodeEntry | undefined>)[
    classifyError(error).code
  ]?.retry;
  return retry === "same" || retry === "later";
}

// False when the deadline expired before the interval ended; expiry ends the sleep at once.
export function sleepWithin(deadline: ExecutionDeadline, ms: number): Promise<boolean> {
  if (deadline.expired()) return Promise.resolve(false);
  return new Promise((resolve) => {
    const signal = deadline.signal;
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(
      () => {
        signal.removeEventListener("abort", onAbort);
        resolve(!deadline.expired());
      },
      Math.min(ms, deadline.remainingMs()),
    );
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
