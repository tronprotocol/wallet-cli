import type { ExecutionDeadline } from "../contracts/deadline.js";
import { untilDeadline } from "./command-deadline.js";

const POLL_INTERVAL_MS = 1500;

// Polls until `attempt` yields a value; undefined once the deadline expires. No attempt starts after
// expiry, and without a limit it polls indefinitely. A failed attempt counts as "not yet".
export async function pollUntilDeadline<T>(
  deadline: ExecutionDeadline,
  attempt: (signal: AbortSignal) => Promise<T | undefined>,
): Promise<T | undefined> {
  for (;;) {
    if (deadline.expired()) return undefined;
    const result = await untilDeadline(attempt(deadline.signal), deadline).catch(() => undefined);
    if (result !== undefined) return result;
    if (!(await sleepWithin(deadline, POLL_INTERVAL_MS))) return undefined;
  }
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
