import { describe, it, expect } from "vitest";
import { PacedHttpTransport, RequestPacer } from "./request-pacer.js";
import type { HttpRequest, HttpTransport } from "./index.js";
import { withDeadline } from "../../../domain/async/index.js";

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const unpaced = (maxInFlight: number) => new RequestPacer({ minIntervalMs: 0, maxInFlight });

describe("RequestPacer in-flight cap", () => {
  it("never runs more than maxInFlight at once", async () => {
    const pacer = unpaced(2);
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 20 }, () =>
        pacer.run(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await tick(1);
          active -= 1;
        }),
      ),
    );
    expect(peak).toBe(2);
    expect(active).toBe(0);
  });

  /** The reason the permit is handed over instead of released: a caller arriving in the window
   *  between a release and the queued runner resuming must not slip past the cap. */
  it("holds the cap when new callers arrive while the queue is draining", async () => {
    const pacer = unpaced(2);
    let active = 0;
    let peak = 0;
    const task = () =>
      pacer.run(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await tick(2);
        active -= 1;
      });
    const running = Array.from({ length: 6 }, task);
    await tick(1);
    running.push(...Array.from({ length: 6 }, task));
    await Promise.all(running);
    expect(peak).toBe(2);
  });

  it("serves the queue in arrival order", async () => {
    const pacer = unpaced(1);
    const order: number[] = [];
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        pacer.run(async () => {
          order.push(i);
          await tick(1);
        }),
      ),
    );
    expect(order).toEqual([0, 1, 2, 3, 4]);
  });

  it("releases the permit when a runner throws", async () => {
    const pacer = unpaced(1);
    await expect(
      pacer.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await expect(pacer.run(async () => "ok")).resolves.toBe("ok");
  });

  it("treats a cap below one as one rather than deadlocking", async () => {
    const pacer = new RequestPacer({ minIntervalMs: 0, maxInFlight: 0 });
    await expect(pacer.run(async () => "ok")).resolves.toBe("ok");
  });
});

describe("RequestPacer spacing", () => {
  const starts = async (pacer: RequestPacer, n: number): Promise<number[]> => {
    const at: number[] = [];
    await Promise.all(
      Array.from({ length: n }, () =>
        pacer.run(async () => {
          at.push(Date.now());
        }),
      ),
    );
    return at.sort((a, b) => a - b);
  };
  /** consecutive gaps, with slack for timer jitter */
  const gaps = (at: number[]) => at.slice(1).map((t, i) => t - at[i]!);

  it("spaces consecutive starts by at least the interval", async () => {
    const at = await starts(new RequestPacer({ minIntervalMs: 30, maxInFlight: 4 }), 5);
    expect(gaps(at).every((g) => g >= 25)).toBe(true);
  });

  /** The spacing, not the cap, is what a rate limiter reacts to — so a wide cap must not let a
   *  burst through. */
  it("paces even when the in-flight cap would allow a burst", async () => {
    const started = Date.now();
    await starts(new RequestPacer({ minIntervalMs: 25, maxInFlight: 10 }), 6);
    expect(Date.now() - started).toBeGreaterThanOrEqual(5 * 25 - 5);
  });

  it("claims slots synchronously, so concurrent runners never share one", async () => {
    const at = await starts(new RequestPacer({ minIntervalMs: 20, maxInFlight: 6 }), 6);
    expect(gaps(at).some((g) => g < 15)).toBe(false);
  });

  it("does not wait when idle and the interval has already elapsed", async () => {
    const pacer = new RequestPacer({ minIntervalMs: 40, maxInFlight: 2 });
    await pacer.run(async () => {});
    await tick(60);
    const started = Date.now();
    await pacer.run(async () => {});
    expect(Date.now() - started).toBeLessThan(20);
  });

  it("does no pacing when no interval is configured", async () => {
    const started = Date.now();
    await starts(unpaced(4), 8);
    expect(Date.now() - started).toBeLessThan(50);
  });
});

describe("RequestPacer deadline credit", () => {
  it("does not charge pacing against the caller's deadline", async () => {
    const pacer = new RequestPacer({ minIntervalMs: 60, maxInFlight: 1 });
    const started = Date.now();
    // 5 starts land ~60ms apart and each does 5ms of work: well over the 100ms budget in
    // wall-clock terms, well under it in work.
    await withDeadline(100, () =>
      Promise.all(Array.from({ length: 5 }, () => pacer.run(() => tick(5)))),
    );
    expect(Date.now() - started).toBeGreaterThan(200);
  });

  /** Regression: crediting only after the sleep let the deadline fire mid-wait, rejecting a
   *  request that had not been sent. The credit has to be paid up front. */
  it("survives a single pacing wait longer than the whole deadline", async () => {
    const pacer = new RequestPacer({ minIntervalMs: 200, maxInFlight: 4 });
    await expect(
      withDeadline(50, async () => {
        await pacer.run(async () => "first");
        return pacer.run(async () => "second"); // waits a full 200ms on a 50ms budget
      }),
    ).resolves.toBe("second");
  });

  it("still lets the deadline fire on work that genuinely hangs", async () => {
    const pacer = new RequestPacer({ minIntervalMs: 10, maxInFlight: 1 });
    await expect(withDeadline(60, () => pacer.run(() => tick(5_000)))).rejects.toMatchObject({
      code: "timeout",
    });
  });
});

describe("PacedHttpTransport", () => {
  const recording = () => {
    const starts: number[] = [];
    let active = 0;
    let peak = 0;
    const transport: HttpTransport = {
      async requestText() {
        starts.push(Date.now());
        active += 1;
        peak = Math.max(peak, active);
        await tick(2);
        active -= 1;
        return "{}";
      },
    };
    return { transport, starts, peak: () => peak };
  };

  it("paces and caps every request that reaches it", async () => {
    const inner = recording();
    const paced = new PacedHttpTransport(
      inner.transport,
      new RequestPacer({ minIntervalMs: 30, maxInFlight: 2 }),
    );
    await Promise.all(
      Array.from({ length: 4 }, () => paced.requestText({ method: "POST", path: "/x" })),
    );
    expect(inner.starts).toHaveLength(4);
    expect(inner.peak()).toBeLessThanOrEqual(2);
    const sorted = [...inner.starts].sort((a, b) => a - b);
    expect(sorted.slice(1).every((t, i) => t - sorted[i]! >= 25)).toBe(true);
  });

  it("passes the request through unchanged and returns the body", async () => {
    let seen: HttpRequest | undefined;
    const paced = new PacedHttpTransport(
      {
        async requestText(request) {
          seen = request;
          return "body";
        },
      },
      new RequestPacer({ minIntervalMs: 0, maxInFlight: 1 }),
    );
    const request: HttpRequest = { method: "POST", path: "/wallet/getaccount", body: "{}" };
    await expect(paced.requestText(request)).resolves.toBe("body");
    expect(seen).toEqual(request);
  });

  it("propagates the inner transport's failure", async () => {
    const paced = new PacedHttpTransport(
      {
        requestText: () => Promise.reject(new Error("network down")),
      },
      new RequestPacer({ minIntervalMs: 0, maxInFlight: 1 }),
    );
    await expect(paced.requestText({ method: "GET" })).rejects.toThrow("network down");
    // the permit must have been released, or this second call would hang
    await expect(
      new PacedHttpTransport(
        { requestText: async () => "ok" },
        new RequestPacer({ minIntervalMs: 0, maxInFlight: 1 }),
      ).requestText({ method: "GET" }),
    ).resolves.toBe("ok");
  });
});

describe("RequestPacer abandonment", () => {
  /** Queue time is the one wait the pacer cannot credit, so a caller can time out while still in
   *  line. Sending its request afterwards spends the endpoint budget on a result nobody reads. */
  it("does not send a queued request whose deadline fired while it waited", async () => {
    const pacer = new RequestPacer({ minIntervalMs: 0, maxInFlight: 1 });
    let sent = 0;
    const blocker = pacer.run(() => tick(150)); // holds the only permit past the 30ms budget
    await expect(
      withDeadline(30, () =>
        pacer.run(async () => {
          sent += 1;
        }),
      ),
    ).rejects.toMatchObject({ code: "timeout" });
    await blocker;
    await tick(30);
    expect(sent).toBe(0);
  });

  it("frees the permit of an abandoned request, so the queue keeps draining", async () => {
    const pacer = new RequestPacer({ minIntervalMs: 0, maxInFlight: 1 });
    const blocker = pacer.run(() => tick(120));
    await expect(withDeadline(20, () => pacer.run(async () => "sent"))).rejects.toMatchObject({
      code: "timeout",
    });
    await blocker;
    await expect(pacer.run(async () => "later")).resolves.toBe("later");
  });
});
