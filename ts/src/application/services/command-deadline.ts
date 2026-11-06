import {
  DeadlineExpiredError,
  type DeadlinePause,
  type DispatchCheck,
  type ExecutionDeadline,
} from "../contracts/deadline.js";

// A submit is not dispatched with less time left than this; an admitted submit may still end unknown.
export const SUBMIT_ADMISSION_RESERVE_MS = 2000;

// Monotonic milliseconds; wall-clock changes must not move the deadline.
export interface MonotonicClock {
  now(): number;
}

const PERFORMANCE_CLOCK: MonotonicClock = { now: () => performance.now() };

/**
 * One deadline for a whole command. `limitMs` 0 means no limit: the signal never aborts and
 * remainingMs() is Infinity. `startedAt` is the clock reading when the command started.
 */
export class CommandDeadline implements ExecutionDeadline, DeadlinePause {
  readonly #controller = new AbortController();
  readonly #clock: MonotonicClock;
  #limited: boolean;
  // Budget left at #since; while paused, #since is not used.
  #budgetMs: number;
  #since: number;
  #pauses = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #disposed = false;

  constructor(limitMs: number, startedAt?: number, clock: MonotonicClock = PERFORMANCE_CLOCK) {
    this.#clock = clock;
    this.#limited = limitMs > 0;
    this.#budgetMs = limitMs;
    this.#since = startedAt ?? clock.now();
    if (this.#limited) this.#arm();
  }

  get signal(): AbortSignal {
    return this.#controller.signal;
  }

  remainingMs(): number {
    if (!this.#limited) return Number.POSITIVE_INFINITY;
    if (this.#controller.signal.aborted) return 0;
    const left = this.#pauses > 0 ? this.#budgetMs : this.#budgetMs - this.#elapsed();
    return Math.max(0, left);
  }

  // Compares elapsed time itself, so a timer that has not fired yet cannot extend the deadline.
  expired(): boolean {
    if (!this.#limited) return false;
    if (!this.#controller.signal.aborted && this.remainingMs() <= 0) this.#expire();
    return this.#controller.signal.aborted;
  }

  assertActive(): void {
    if (this.expired()) throw new DeadlineExpiredError();
  }

  pause(): () => void {
    if (!this.#limited || this.expired()) return () => {};
    if (this.#pauses === 0) {
      this.#budgetMs = this.remainingMs();
      this.#clearTimer();
    }
    this.#pauses += 1;
    let resumed = false;
    return () => {
      if (resumed) return;
      resumed = true;
      this.#pauses -= 1;
      if (this.#pauses > 0 || this.#controller.signal.aborted) return;
      this.#since = this.#clock.now();
      this.#arm();
    };
  }

  // Ends the limit for a process that lives on after start-up (a server). An expired deadline stays
  // expired; the signal of a released one never aborts.
  release(): void {
    if (this.expired()) return;
    this.#limited = false;
    this.#clearTimer();
  }

  // Stops the timer so the process can end; the deadline keeps answering from elapsed time.
  dispose(): void {
    this.#disposed = true;
    this.#clearTimer();
  }

  #elapsed(): number {
    return this.#clock.now() - this.#since;
  }

  #arm(): void {
    this.#clearTimer();
    if (this.#disposed) return;
    const left = this.remainingMs();
    if (left <= 0) {
      this.#expire();
      return;
    }
    // A timer can fire early relative to the clock; re-arm for what is left.
    this.#timer = setTimeout(() => this.#arm(), left);
  }

  #clearTimer(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  #expire(): void {
    this.#clearTimer();
    if (!this.#controller.signal.aborted) this.#controller.abort(new DeadlineExpiredError());
  }
}

// Refuses a fund-moving or service submit before its wrapper runs when too little time is left.
export function assertSubmitAdmitted(deadline: ExecutionDeadline): void {
  deadline.assertActive();
  if (deadline.remainingMs() < SUBMIT_ADMISSION_RESERVE_MS) {
    throw new DeadlineExpiredError(
      "too little of the command's time limit is left to submit; nothing was sent",
    );
  }
}

// For a submit: the admission check runs again at transport dispatch, after queues and retries.
export function submitDispatchCheck(deadline: ExecutionDeadline): DispatchCheck {
  return { signal: deadline.signal, assertDispatchable: () => assertSubmitAdmitted(deadline) };
}

// For reads and other requests that only need time left.
export function requestDispatchCheck(deadline: ExecutionDeadline): DispatchCheck {
  return { signal: deadline.signal, assertDispatchable: () => deadline.assertActive() };
}

// True when an error ended an operation because the deadline ran out, whatever the adapter called it.
export function endedByDeadline(error: unknown, deadline: ExecutionDeadline): boolean {
  return error instanceof DeadlineExpiredError || deadline.expired();
}

// A catch handler for optional work: deadline expiry still fails the operation; any other error
// gives the fallback.
export function unlessDeadline<T>(
  deadline: ExecutionDeadline,
  fallback: (error: unknown) => T,
): (error: unknown) => T {
  return (error) => {
    if (endedByDeadline(error, deadline)) throw error;
    return fallback(error);
  };
}

// Rejects with DeadlineExpiredError on expiry. Only for one leaf call whose late completion causes
// no further side effect; the late result or error is observed and dropped.
export function untilDeadline<T>(work: Promise<T>, deadline: ExecutionDeadline): Promise<T> {
  if (deadline.remainingMs() === Number.POSITIVE_INFINITY) return work;
  return new Promise<T>((resolve, reject) => {
    const signal = deadline.signal;
    const onAbort = () => reject(new DeadlineExpiredError());
    if (deadline.expired()) {
      work.catch(() => {});
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}
