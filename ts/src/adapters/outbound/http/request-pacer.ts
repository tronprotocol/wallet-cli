import { creditActiveDeadline, throwIfDeadlineExpired } from "../../../domain/async/index.js";
import type { HttpRequest, HttpTransport } from "./index.js";

export interface RequestPacerOptions {
  /**
   * Minimum spacing between consecutive request *starts*. This is the constraint that actually
   * keeps a public node happy: TronGrid's anonymous tier admits ~3 requests per second on
   * account-scoped endpoints and rejects the rest with HTTP 429 — identically whether they arrive
   * concurrently or strictly sequentially, so serialising alone does not help. Measured: starts
   * 300ms apart still drew 429s, 350ms ran clean, and 400ms is the shipped value for margin.
   */
  minIntervalMs: number;
  /**
   * Cap on requests in flight at once. Secondary: once starts are paced, concurrency barely rises
   * on its own. It bounds open sockets, and it keeps one slow response from stalling the schedule —
   * with a cap of 1 the next start waits for the previous *response* rather than the next slot.
   */
  maxInFlight: number;
}

/**
 * Paces outbound requests to one endpoint: a FIFO queue that admits at most `maxInFlight` at a
 * time and starts them no closer together than `minIntervalMs`.
 *
 * Callers keep whatever concurrency they like — a `Promise.all` still creates every promise at
 * once — and this decides what reaches the wire and when.
 *
 * Waiting here is progress, not a hang, so the time a request spends queued or paced is credited
 * back to the deadline it is running under (see `withDeadline`). Without that, a wide fan-out
 * reports a timeout for requests the node never received.
 *
 * One wait is not covered: time spent queued behind requests that are already in flight is only
 * credited once the permit arrives, so a deadline shorter than those requests take can still fire
 * while queued. That is the honest answer — the endpoint really is slower than the caller's
 * budget — whereas pacing is self-imposed and must never be charged. A request that loses its
 * deadline that way is dropped rather than sent: nobody is left to read the result.
 */
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
      // Queue time is the one wait that is not credited up front, so the caller may already have
      // given up. Checked before claiming a start slot, so an abandoned request costs neither a
      // request to the endpoint nor a place in the schedule.
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

  /**
   * The permit is handed straight to the next runner in line rather than released and re-acquired:
   * a caller arriving in the window between a release and the queued runner resuming would
   * otherwise slip past the cap.
   */
  #release(): void {
    const next = this.#queue.shift();
    if (next) next();
    else this.#active -= 1;
  }

  /**
   * Claim the next start slot, then wait for it. Claiming before the await is what stops two
   * concurrent runners from taking the same slot.
   *
   * The credit is paid before the sleep, not after: a deadline shorter than the wait would
   * otherwise fire part-way through and reject a request that had not even been sent.
   */
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

/**
 * An HttpTransport that runs every request through a pacer. Decorating the transport rather than
 * each call site means a caller cannot forget: whatever reaches `requestText` is paced.
 *
 * One pacer instance is one budget, so share it between everything talking to the same endpoint —
 * a transport wrapped with its own private pacer paces only itself.
 */
export class PacedHttpTransport implements HttpTransport {
  constructor(
    private readonly inner: HttpTransport,
    private readonly pacer: RequestPacer,
  ) {}

  requestText(request: HttpRequest): Promise<string> {
    return this.pacer.run(() => this.inner.requestText(request));
  }
}
