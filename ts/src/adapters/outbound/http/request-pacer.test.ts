import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PacedHttpTransport, RequestPacer } from "./request-pacer.js";
import type { HttpRequest, HttpTransport } from "./index.js";
import { withDispatchCheck } from "./dispatch-context.js";
import {
  DeadlineExpiredError,
  type DispatchCheck,
} from "../../../application/contracts/deadline.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// A check whose signal aborts after `ms` of fake time.
const timedCheck = (ms: number): DispatchCheck => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DeadlineExpiredError()), ms);
  return {
    signal: controller.signal,
    assertDispatchable: () => {
      if (controller.signal.aborted) throw controller.signal.reason;
    },
  };
};
const withDeadline = <T>(ms: number, work: () => Promise<T>) =>
  withDispatchCheck(timedCheck(ms), work);
const unpaced = (maxInFlight: number) => new RequestPacer({ minIntervalMs: 0, maxInFlight });

// Handle rejections while advancing the clock, then return the original promise.
const settle = async <T>(work: Promise<T>): Promise<T> => {
  work.catch(() => {});
  await vi.runAllTimersAsync();
  return work;
};

describe("RequestPacer in-flight cap", () => {
  it("never runs more than maxInFlight at once", async () => {
    const pacer = unpaced(2);
    let active = 0;
    let peak = 0;
    await settle(
      Promise.all(
        Array.from({ length: 20 }, () =>
          pacer.run(async () => {
            active += 1;
            peak = Math.max(peak, active);
            await tick(1);
            active -= 1;
          }),
        ),
      ),
    );
    expect(peak).toBe(2);
    expect(active).toBe(0);
  });

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
    await vi.advanceTimersByTimeAsync(1);
    running.push(...Array.from({ length: 6 }, task));
    await settle(Promise.all(running));
    expect(peak).toBe(2);
  });

  it("serves the queue in arrival order", async () => {
    const pacer = unpaced(1);
    const order: number[] = [];
    await settle(
      Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          pacer.run(async () => {
            order.push(i);
            await tick(1);
          }),
        ),
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
    await settle(
      Promise.all(
        Array.from({ length: n }, () =>
          pacer.run(async () => {
            at.push(Date.now());
          }),
        ),
      ),
    );
    return at.sort((a, b) => a - b);
  };
  const gaps = (at: number[]) => at.slice(1).map((t, i) => t - at[i]!);

  it("spaces consecutive starts by exactly the interval", async () => {
    const at = await starts(new RequestPacer({ minIntervalMs: 30, maxInFlight: 4 }), 5);
    expect(gaps(at)).toEqual([30, 30, 30, 30]);
  });

  it("paces even when the in-flight cap would allow a burst", async () => {
    const started = Date.now();
    await starts(new RequestPacer({ minIntervalMs: 25, maxInFlight: 10 }), 6);
    expect(Date.now() - started).toBe(5 * 25);
  });

  it("claims slots synchronously, so concurrent runners never share one", async () => {
    const at = await starts(new RequestPacer({ minIntervalMs: 20, maxInFlight: 6 }), 6);
    expect(gaps(at)).toEqual([20, 20, 20, 20, 20]);
  });

  it("does not wait when idle and the interval has already elapsed", async () => {
    const pacer = new RequestPacer({ minIntervalMs: 40, maxInFlight: 2 });
    await settle(pacer.run(async () => {}));
    await vi.advanceTimersByTimeAsync(60);
    const started = Date.now();
    await settle(pacer.run(async () => {}));
    expect(Date.now() - started).toBe(0);
  });

  it("does no pacing when no interval is configured", async () => {
    const started = Date.now();
    await starts(unpaced(4), 8);
    expect(Date.now() - started).toBe(0);
  });
});

describe("RequestPacer dispatch check", () => {
  it("runs the check when the slot is claimed and again immediately before the request starts", async () => {
    const pacer = new RequestPacer({ minIntervalMs: 50, maxInFlight: 1 });
    const events: string[] = [];
    let allowed = true;
    const check: DispatchCheck = {
      signal: new AbortController().signal,
      assertDispatchable: () => {
        events.push(`check@${Date.now()}`);
        if (!allowed) throw new DeadlineExpiredError();
      },
    };
    const started = Date.now();
    await settle(pacer.run(async () => events.push("first")));
    const second = withDispatchCheck(check, () =>
      pacer.run(async () => {
        events.push(`sent@${Date.now()}`);
      }),
    );
    await settle(second);
    expect(events).toEqual([
      "first",
      `check@${started + 50}`,
      `check@${started + 50}`,
      `sent@${started + 50}`,
    ]);

    allowed = false;
    let sent = 0;
    await expect(
      settle(withDispatchCheck(check, () => pacer.run(async () => (sent += 1)))),
    ).rejects.toBeInstanceOf(DeadlineExpiredError);
    expect(sent).toBe(0);
  });

  it("does not send a request whose deadline fires during the pacing wait", async () => {
    const pacer = new RequestPacer({ minIntervalMs: 200, maxInFlight: 4 });
    let sent = 0;
    await settle(pacer.run(async () => "first"));
    await expect(
      settle(withDeadline(50, () => pacer.run(async () => (sent += 1)))),
    ).rejects.toBeInstanceOf(DeadlineExpiredError);
    expect(sent).toBe(0);
  });

  it.each([1, 4])(
    "gives the slot of a request cancelled while pacing to the next one (maxInFlight %i)",
    async (maxInFlight) => {
      const pacer = new RequestPacer({ minIntervalMs: 200, maxInFlight });
      const started = Date.now();
      await settle(pacer.run(async () => "first"));
      const cancelled = withDeadline(30, () => pacer.run(async () => "never"));
      cancelled.catch(() => {});
      await vi.advanceTimersByTimeAsync(30);
      await expect(cancelled).rejects.toBeInstanceOf(DeadlineExpiredError);
      const at: number[] = [];
      await settle(Promise.all([0, 1].map(() => pacer.run(async () => at.push(Date.now())))));
      expect(at).toEqual([started + 200, started + 400]);
    },
  );

  it("claims no slot for a request whose deadline has passed before its timer fired", async () => {
    const pacer = new RequestPacer({ minIntervalMs: 200, maxInFlight: 1 });
    const expired: DispatchCheck = {
      signal: new AbortController().signal,
      assertDispatchable: () => {
        throw new DeadlineExpiredError();
      },
    };
    const started = Date.now();
    await expect(
      withDispatchCheck(expired, () => pacer.run(async () => "never")),
    ).rejects.toBeInstanceOf(DeadlineExpiredError);
    const at: number[] = [];
    await settle(pacer.run(async () => at.push(Date.now())));
    expect(at).toEqual([started]);
  });

  it("checks again in the turn that sends, after the pacing wait has resolved", async () => {
    const pacer = new RequestPacer({ minIntervalMs: 200, maxInFlight: 1 });
    let calls = 0;
    // Passes the check made when the slot is claimed, then expires before the send.
    const check: DispatchCheck = {
      signal: new AbortController().signal,
      assertDispatchable: () => {
        calls += 1;
        if (calls > 1) throw new DeadlineExpiredError();
      },
    };
    let sent = 0;
    await expect(
      withDispatchCheck(check, () => pacer.run(async () => (sent += 1))),
    ).rejects.toBeInstanceOf(DeadlineExpiredError);
    expect(sent).toBe(0);
  });

  it("refuses at once when the deadline has already fired", async () => {
    const pacer = unpaced(1);
    const controller = new AbortController();
    controller.abort(new DeadlineExpiredError());
    const check = { signal: controller.signal, assertDispatchable: () => {} };
    await expect(
      withDispatchCheck(check, () => pacer.run(async () => "sent")),
    ).rejects.toBeInstanceOf(DeadlineExpiredError);
    await expect(settle(pacer.run(async () => "later"))).resolves.toBe("later");
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
    await settle(
      Promise.all(
        Array.from({ length: 4 }, () => paced.requestText({ method: "POST", path: "/x" })),
      ),
    );
    expect(inner.starts).toHaveLength(4);
    expect(inner.peak()).toBeLessThanOrEqual(2);
    const sorted = [...inner.starts].sort((a, b) => a - b);
    expect(sorted.slice(1).map((t, i) => t - sorted[i]!)).toEqual([30, 30, 30]);
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
    await expect(
      new PacedHttpTransport(
        { requestText: async () => "ok" },
        new RequestPacer({ minIntervalMs: 0, maxInFlight: 1 }),
      ).requestText({ method: "GET" }),
    ).resolves.toBe("ok");
  });
});

describe("RequestPacer abandonment", () => {
  it("does not send a queued request whose deadline fired while it waited", async () => {
    const pacer = new RequestPacer({ minIntervalMs: 0, maxInFlight: 1 });
    let sent = 0;
    const blocker = pacer.run(() => tick(150));
    const queued = withDeadline(30, () =>
      pacer.run(async () => {
        sent += 1;
      }),
    );
    await expect(settle(queued)).rejects.toMatchObject({ code: "timeout" });
    await settle(blocker);
    expect(sent).toBe(0);
  });

  it("drops an expired entry from the queue without using a permit", async () => {
    const pacer = new RequestPacer({ minIntervalMs: 0, maxInFlight: 1 });
    const order: string[] = [];
    const blocker = pacer.run(async () => {
      await tick(100);
      order.push("blocker");
    });
    const expired = withDeadline(20, () => pacer.run(async () => order.push("expired")));
    const next = pacer.run(async () => {
      order.push(`next@${Date.now()}`);
    });
    const started = Date.now();
    await expect(settle(expired)).rejects.toBeInstanceOf(DeadlineExpiredError);
    await settle(Promise.all([blocker, next]));
    expect(order).toEqual(["blocker", `next@${started + 100}`]);
  });

  it("frees the permit of an abandoned request, so the queue keeps draining", async () => {
    const pacer = new RequestPacer({ minIntervalMs: 0, maxInFlight: 1 });
    const blocker = pacer.run(() => tick(120));
    const abandoned = withDeadline(20, () => pacer.run(async () => "sent"));
    await expect(settle(abandoned)).rejects.toMatchObject({ code: "timeout" });
    await settle(blocker);
    await expect(settle(pacer.run(async () => "later"))).resolves.toBe("later");
  });
});
