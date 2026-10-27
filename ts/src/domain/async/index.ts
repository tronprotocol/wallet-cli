import { AsyncLocalStorage } from "node:async_hooks";

import { ChainError } from "../errors/index.js";

// onTimeout must cancel the work; use withDeadline for work that needs queue-time credit.
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
  // Includes enclosing deadlines.
  expired: () => boolean;
}

const activeDeadline = new AsyncLocalStorage<Deadline>();

// Installs a deadline before work starts, allowing queue-time credit via creditActiveDeadline.
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
      if (remaining > 0) {
        timer = setTimeout(fire, remaining);
        return;
      }
      settled = true;
      timedOut = true;
      onTimeout();
      reject(new ChainError("timeout", `operation timed out after ${ms}ms`));
    }

    // Queue waits must extend every enclosing deadline.
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
      // A synchronous throw bypasses the promise handlers; clear the timer so the process can exit.
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

// Credit queue waits before waiting; no-op outside withDeadline.
export function creditActiveDeadline(ms: number): void {
  activeDeadline.getStore()?.extendBy(ms);
}

// Prevent sending queued requests after timeout; no-op outside withDeadline.
export function throwIfDeadlineExpired(): void {
  if (activeDeadline.getStore()?.expired()) {
    throw new ChainError("timeout", "operation timed out before the request was sent");
  }
}
