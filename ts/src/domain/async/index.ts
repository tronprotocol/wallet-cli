import { AsyncLocalStorage } from "node:async_hooks";

import { ChainError } from "../errors/index.js";

/**
 * Race a promise against a deadline. On timeout it rejects with a ChainError("timeout") and
 * runs `onTimeout` (e.g. to abort an in-flight request or a Ledger prompt). The underlying
 * promise keeps running — callers that need true cancellation must wire `onTimeout` to an abort.
 *
 * Not for node reads and writes: those are paced, and a promise created before the deadline exists
 * cannot give back the time it spends queued. Use `withDeadline` there — misusing this one costs
 * no error, just spurious timeouts on a busy fan-out.
 */
export function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new ChainError("timeout", `operation timed out after ${ms}ms`));
    }, ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

interface Deadline {
  extendBy: (ms: number) => void;
  /** True once this deadline — or any deadline enclosing it — has fired. */
  expired: () => boolean;
}

/** The innermost deadline the current operation runs under, if any — see `withDeadline`. */
const activeDeadline = new AsyncLocalStorage<Deadline>();

/**
 * Run `work` under a deadline, rejecting with ChainError("timeout") and calling `onTimeout` if it
 * overruns. Unlike `withTimeout` this takes a thunk, so the deadline is installed *before* the work
 * starts and stays reachable from inside it.
 *
 * Work that deliberately holds itself back — a scheduler queueing or pacing a request it has not
 * sent yet — calls `creditActiveDeadline` to give that time back. A deadline is there to catch a
 * call that hangs, and a request still waiting its turn is not hanging.
 */
export function withDeadline<T>(
  ms: number,
  work: () => Promise<T>,
  onTimeout: () => void = () => {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let expiresAt = Date.now() + ms;
    let settled = false;
    let timedOut = false;
    let timer = setTimeout(fire, ms);

    function fire(): void {
      const remaining = expiresAt - Date.now();
      // a later extendBy pushed the deadline out; re-arm rather than fire early
      if (remaining > 0) {
        timer = setTimeout(fire, remaining);
        return;
      }
      settled = true;
      timedOut = true;
      onTimeout();
      reject(new ChainError("timeout", `operation timed out after ${ms}ms`));
    }

    // Credit has to reach every enclosing deadline, not just this one: `#wrap` nests, so a paced
    // request can run several deadlines deep and each of them is charged for the same wait.
    const parent = activeDeadline.getStore();
    const handle: Deadline = {
      extendBy: (extraMs: number) => {
        if (extraMs <= 0) return;
        if (!settled) expiresAt += extraMs;
        parent?.extendBy(extraMs);
      },
      expired: () => timedOut || parent?.expired() === true,
    };

    let running: Promise<T>;
    try {
      running = activeDeadline.run(handle, work);
    } catch (error) {
      // `work` threw before it returned a promise, so neither settle handler below will run. The
      // timer has to go with it: the CLI drains the event loop instead of calling process.exit, so
      // one left armed keeps the command alive for the rest of its budget after it has finished.
      settled = true;
      clearTimeout(timer);
      reject(error);
      return;
    }

    running.then(
      (value) => {
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Give back time the current operation spends waiting rather than working, pushing its deadline out
 * by the same amount. A no-op outside `withDeadline`, so a scheduler can call it unconditionally.
 *
 * Credit a wait of known length BEFORE taking it. Paying afterwards leaves the deadline free to
 * fire part-way through a wait it was about to be excused for.
 */
export function creditActiveDeadline(ms: number): void {
  activeDeadline.getStore()?.extendBy(ms);
}

/**
 * Throw if the current operation's deadline has already fired, so work that resumes after the
 * caller gave up stops instead of finishing. A no-op outside `withDeadline`.
 *
 * Meant for a scheduler that holds a request it has not sent yet: once the deadline is gone nobody
 * reads the result, and sending it anyway spends the endpoint's budget — or, on the broadcast path,
 * submits a transaction the caller was told had timed out.
 */
export function throwIfDeadlineExpired(): void {
  if (activeDeadline.getStore()?.expired()) {
    throw new ChainError("timeout", "operation timed out before the request was sent");
  }
}
