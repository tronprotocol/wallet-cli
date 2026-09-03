import { describe, it, expect, vi } from "vitest";
import { creditActiveDeadline, throwIfDeadlineExpired, withDeadline } from "./index.js";

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("withDeadline", () => {
  it("resolves work that finishes in time", async () => {
    await expect(withDeadline(200, async () => "done")).resolves.toBe("done");
  });

  it("rejects with ChainError(timeout) when the work overruns", async () => {
    await expect(withDeadline(20, () => tick(500))).rejects.toMatchObject({ code: "timeout" });
  });

  it("runs onTimeout so the caller can abort the underlying work", async () => {
    let aborted = false;
    await expect(
      withDeadline(
        20,
        () => tick(500),
        () => {
          aborted = true;
        },
      ),
    ).rejects.toMatchObject({ code: "timeout" });
    expect(aborted).toBe(true);
  });

  it("propagates the work's own rejection unchanged", async () => {
    await expect(
      withDeadline(200, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});

describe("creditActiveDeadline", () => {
  /** The point of the whole thing: time a scheduler spends holding a request it has not sent yet
   *  must not be charged against that request's deadline. A self-imposed wait of a known length is
   *  credited BEFORE it is taken, so the deadline cannot fire part-way through it. */
  it("buys back time, so wall-clock may exceed the budget while the work does not", async () => {
    const started = Date.now();
    const result = await withDeadline(60, async () => {
      for (let i = 0; i < 4; i++) {
        creditActiveDeadline(40);
        await tick(40); // stand-in for pacing
        await tick(10); // the actual work
      }
      return "done";
    });
    expect(result).toBe("done");
    expect(Date.now() - started).toBeGreaterThan(150);
  });

  it("still lets the deadline fire on work that genuinely hangs", async () => {
    await expect(
      withDeadline(60, async () => {
        creditActiveDeadline(30);
        await tick(5_000);
      }),
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it("ignores non-positive credit", async () => {
    await expect(
      withDeadline(30, async () => {
        creditActiveDeadline(-10_000);
        await tick(300);
      }),
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it("is a no-op outside a deadline", () => {
    expect(() => creditActiveDeadline(100)).not.toThrow();
  });
});

describe("nested deadlines", () => {
  /** `#wrap` nests: getTrc10Balance runs inside a deadline and calls getAccount, which opens its
   *  own. A pacing wait credited only to the innermost one still burns the outer one's budget. */
  it("credits every enclosing deadline, not just the innermost", async () => {
    await expect(
      withDeadline(60, () =>
        withDeadline(60, async () => {
          creditActiveDeadline(200);
          await tick(200);
          return "done";
        }),
      ),
    ).resolves.toBe("done");
  });

  it("credits through more than one level of nesting", async () => {
    await expect(
      withDeadline(60, () =>
        withDeadline(60, () =>
          withDeadline(60, async () => {
            creditActiveDeadline(200);
            await tick(200);
            return "done";
          }),
        ),
      ),
    ).resolves.toBe("done");
  });

  it("still lets an enclosing deadline fire on work that genuinely hangs", async () => {
    await expect(
      withDeadline(60, () =>
        withDeadline(5_000, async () => {
          creditActiveDeadline(30);
          await tick(5_000);
        }),
      ),
    ).rejects.toMatchObject({ code: "timeout" });
  });
});

describe("throwIfDeadlineExpired", () => {
  it("is a no-op outside a deadline", () => {
    expect(() => throwIfDeadlineExpired()).not.toThrow();
  });

  it("lets work continue while the deadline is still live", async () => {
    await expect(
      withDeadline(200, async () => {
        await tick(10);
        throwIfDeadlineExpired();
        return "done";
      }),
    ).resolves.toBe("done");
  });

  /** Nobody is waiting on the result any more, so a scheduler holding the request must drop it
   *  rather than send it — a broadcast reported as a timeout must not reach the node afterwards. */
  it("stops work that resumes after its deadline has fired", async () => {
    let sent = false;
    const done = withDeadline(20, async () => {
      await tick(80);
      throwIfDeadlineExpired();
      sent = true;
    });
    await expect(done).rejects.toMatchObject({ code: "timeout" });
    await tick(80);
    expect(sent).toBe(false);
  });

  it("stops work whose enclosing deadline has fired, even under a live inner one", async () => {
    let sent = false;
    const done = withDeadline(20, () =>
      withDeadline(5_000, async () => {
        await tick(80);
        throwIfDeadlineExpired();
        sent = true;
      }),
    );
    await expect(done).rejects.toMatchObject({ code: "timeout" });
    await tick(80);
    expect(sent).toBe(false);
  });
});

describe("withDeadline timer hygiene", () => {
  /** The CLI sets process.exitCode and lets the event loop drain, so a timer left armed keeps the
   *  whole command alive for the rest of its budget after the result has already been printed. */
  it("leaves no timer armed when the work throws before returning a promise", async () => {
    vi.useFakeTimers();
    try {
      await expect(
        withDeadline(30_000, (() => {
          throw new Error("sync boom");
        }) as () => Promise<never>),
      ).rejects.toThrow("sync boom");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
