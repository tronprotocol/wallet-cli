import { abortableDelay, abortReason, activeDispatch, dispatchNow } from "./dispatch-context.js";
import type { HttpRequest, HttpTransport } from "./index.js";

export interface RequestPacerOptions {
  // Space request starts; limiting concurrency alone does not prevent rate limits.
  minIntervalMs: number;
  maxInFlight: number;
}

interface Waiter {
  readonly grant: () => void;
}

// Requests wait under the dispatch check of their call: an aborted wait leaves the queue and the
// pacing schedule without a slot, and the check runs again after the wait, right before the
// request starts.
export class RequestPacer {
  readonly #minIntervalMs: number;
  readonly #maxInFlight: number;
  readonly #queue: Waiter[] = [];
  #active = 0;
  #nextStartAt = 0;

  constructor(options: RequestPacerOptions) {
    this.#minIntervalMs = options.minIntervalMs;
    this.#maxInFlight = Math.max(1, options.maxInFlight);
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const context = activeDispatch();
    const signal = context?.check.signal;
    await this.#acquire(signal);
    try {
      await this.#awaitStart(context);
      return await fn();
    } finally {
      this.#release();
    }
  }

  #acquire(signal: AbortSignal | undefined): Promise<void> {
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    if (this.#active < this.#maxInFlight) {
      this.#active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        const index = this.#queue.indexOf(waiter);
        if (index >= 0) this.#queue.splice(index, 1);
        reject(abortReason(signal!));
      };
      const waiter: Waiter = {
        grant: () => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        },
      };
      this.#queue.push(waiter);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  // Transfer the permit directly so new callers cannot exceed the cap.
  #release(): void {
    const next = this.#queue.shift();
    if (next) next.grant();
    else this.#active -= 1;
  }

  // A runner claims a start slot only when it is free, synchronously after waking, so concurrent
  // runners never share one. The dispatch check runs before the claim, so an expired runner claims
  // none even when its abort timer has not fired yet.
  async #awaitStart(context: ReturnType<typeof activeDispatch>): Promise<void> {
    if (this.#minIntervalMs <= 0) {
      dispatchNow(context);
      return;
    }
    for (;;) {
      const now = Date.now();
      if (now >= this.#nextStartAt) {
        dispatchNow(context);
        this.#nextStartAt = now + this.#minIntervalMs;
        return;
      }
      await abortableDelay(this.#nextStartAt - now, context?.check.signal);
    }
  }
}

// Share one pacer across all transports using the same endpoint budget.
export class PacedHttpTransport implements HttpTransport {
  constructor(
    private readonly inner: HttpTransport,
    private readonly pacer: RequestPacer,
  ) {}

  requestText(request: HttpRequest): Promise<string> {
    return this.pacer.run(() => this.inner.requestText(request));
  }
}
