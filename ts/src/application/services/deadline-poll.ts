import { classifyError } from "../../domain/errors/index.js";
import { errorCodeEntry } from "../../domain/errors/codes.js";
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
  const retry = errorCodeEntry(classifyError(error).code)?.retry;
  return retry === "same" || retry === "later";
}

// True only after the whole interval passed within the deadline; false as soon as the deadline expires.
export function sleepWithin(deadline: ExecutionDeadline, ms: number): Promise<boolean> {
  if (deadline.expired()) return Promise.resolve(false);
  return new Promise((resolve) => {
    const signal = deadline.signal;
    let left = ms;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    // A step is cut to the deadline's remaining time, so its end alone does not mean the interval passed.
    const arm = () => {
      const step = Math.min(left, deadline.remainingMs());
      timer = setTimeout(() => {
        left -= step;
        if (deadline.expired() || left <= 0) {
          signal.removeEventListener("abort", onAbort);
          resolve(!deadline.expired());
          return;
        }
        arm();
      }, step);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    arm();
  });
}
