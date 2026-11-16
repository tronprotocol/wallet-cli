import { classifyError } from "../../domain/errors/index.js";
import { errorCodeEntry } from "../../domain/errors/codes.js";
import type { ExecutionDeadline } from "../contracts/deadline.js";
import { endedByDeadline, untilDeadline, type MonotonicClock } from "./command-deadline.js";

const POLL_INTERVAL_MS = 1500;
// Shortest step after a step cut to the deadline's remaining time when that time did not shrink (a paused
// deadline), so it cannot cause a run of sub-millisecond wakeups.
const MIN_STEP_AFTER_CUT_MS = 25;
const MONOTONIC_CLOCK: MonotonicClock = { now: () => performance.now() };

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
// The interval is measured on a monotonic clock, not by adding up timer delays.
export function sleepWithin(deadline: ExecutionDeadline, ms: number): Promise<boolean> {
  if (deadline.expired()) return Promise.resolve(false);
  const clock = MONOTONIC_CLOCK;
  const end = clock.now() + ms;
  return new Promise((resolve) => {
    const signal = deadline.signal;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const settle = (value: boolean) => {
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    };
    // `cutAt` is the remaining time the previous step was cut to, if it was cut.
    const arm = (cutAt?: number) => {
      const left = end - clock.now();
      const remaining = deadline.remainingMs();
      let step = Math.min(left, remaining);
      if (cutAt !== undefined && remaining >= cutAt) {
        step = Math.max(step, Math.min(left, MIN_STEP_AFTER_CUT_MS));
      }
      timer = setTimeout(() => {
        if (deadline.expired()) return settle(false);
        if (end - clock.now() <= 0) return settle(true);
        arm(remaining < left ? remaining : undefined);
      }, step);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    arm();
  });
}
