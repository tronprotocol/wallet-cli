import { creditActiveDeadline, throwIfDeadlineExpired } from "../../../domain/async/index.js";
import type { HttpRequest, HttpTransport } from "./index.js";

export interface RequestPacerOptions {
  // Space request starts; limiting concurrency alone does not prevent rate limits.
  minIntervalMs: number;
  maxInFlight: number;
}

// Queue time is credited after acquisition; pacing time is credited before waiting.
export class RequestPacer {
  readonly #minIntervalMs: number;
  readonly #maxInFlight: number;
  readonly #queue: Array<() => void> = [];
  #active = 0;
  #nextStartAt = 0;

  constructor(options: RequestPacerOptions) {
    this.#minIntervalMs = options.minIntervalMs;
    this.#maxInFlight = Math.max(1, options.maxInFlight);
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const queuedFrom = Date.now();
    await this.#acquire();
    try {
      creditActiveDeadline(Date.now() - queuedFrom);
      // Drop expired requests before claiming a start slot.
      throwIfDeadlineExpired();
      await this.#pace();
      return await fn();
    } finally {
      this.#release();
    }
  }

  #acquire(): Promise<void> {
    if (this.#active < this.#maxInFlight) {
      this.#active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.#queue.push(resolve));
  }

  // Transfer the permit directly so new callers cannot exceed the cap.
  #release(): void {
    const next = this.#queue.shift();
    if (next) next();
    else this.#active -= 1;
  }

  // Claim slots synchronously and credit pacing before waiting to avoid premature timeout.
  #pace(): Promise<void> {
    if (this.#minIntervalMs <= 0) return Promise.resolve();
    const now = Date.now();
    const startAt = Math.max(now, this.#nextStartAt);
    this.#nextStartAt = startAt + this.#minIntervalMs;
    const wait = startAt - now;
    if (wait <= 0) return Promise.resolve();
    creditActiveDeadline(wait);
    return new Promise((resolve) => setTimeout(resolve, wait));
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
