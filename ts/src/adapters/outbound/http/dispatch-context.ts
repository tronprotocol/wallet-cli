import { AsyncLocalStorage } from "node:async_hooks";

import {
  DeadlineExpiredError,
  type DispatchCheck,
} from "../../../application/contracts/deadline.js";
import { TransportError } from "../../../domain/errors/index.js";

// The dispatch check of one port call, visible to the transports and queues it reaches.
export interface DispatchContext {
  readonly check: DispatchCheck;
  // Set when a request of this call has been handed to the network.
  dispatched: boolean;
}

const active = new AsyncLocalStorage<DispatchContext>();

export function withDispatchCheck<T>(check: DispatchCheck, work: () => T): T {
  return active.run({ check, dispatched: false }, work);
}

export function activeDispatch(): DispatchContext | undefined {
  return active.getStore();
}

// Runs the check, then marks the call as sent. Call immediately before the transport sends.
export function dispatchNow(context: DispatchContext | undefined): void {
  context?.check.assertDispatchable();
  if (context) context.dispatched = true;
}

// The error for a call stopped by its signal: nothing was sent, or the reply is unknown.
export function stoppedBySignal(context: DispatchContext | undefined, label: string): Error {
  if (context?.dispatched) return new TransportError("timeout", `${label} timed out`);
  const reason: unknown = context?.check.signal.reason;
  return reason instanceof Error ? reason : new DeadlineExpiredError();
}

// Every method call on the result runs under `check`. The target keeps no request state.
export function bindDispatchCheck<T extends object>(target: T, check: DispatchCheck): T {
  return new Proxy(target, {
    get(object, property) {
      const value: unknown = Reflect.get(object, property, object);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) =>
        withDispatchCheck(check, () => (value as (...a: unknown[]) => unknown).apply(object, args));
    },
  });
}

// Ends a call that cannot be aborted when its signal aborts. The late result is observed and
// dropped; queued requests of the call see the same aborted signal and are not sent.
export function untilAborted<T>(work: Promise<T>, label: string): Promise<T> {
  const context = activeDispatch();
  const signal = context?.check.signal;
  if (!signal) return work;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(stoppedBySignal(context, label));
    if (signal.aborted) {
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
        reject(signal.aborted ? stoppedBySignal(context, label) : error);
      },
    );
  });
}

// Waits `ms` unless the signal aborts first.
export function abortableDelay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    if (ms <= 0) {
      resolve();
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal!));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new DeadlineExpiredError();
}
