import { describe, expect, it, vi } from "vitest";
import { ChainError } from "../../domain/errors/index.js";
import { CommandDeadline } from "./command-deadline.js";
import { pollUntilDeadline, sleepWithin } from "./deadline-poll.js";
import type { ExecutionDeadline } from "../contracts/deadline.js";

describe("pollUntilDeadline", () => {
  it("passes the deadline signal to each attempt and returns the first value", async () => {
    const deadline = new CommandDeadline(0);
    let calls = 0;
    const signals: AbortSignal[] = [];
    vi.useFakeTimers();
    try {
      const result = pollUntilDeadline(deadline, async (signal) => {
        signals.push(signal);
        return ++calls === 3 ? "seen" : undefined;
      });
      await vi.advanceTimersByTimeAsync(3_000);
      await expect(result).resolves.toBe("seen");
    } finally {
      vi.useRealTimers();
    }
    expect(signals).toEqual([deadline.signal, deadline.signal, deadline.signal]);
  });

  it("ends a hung attempt at expiry and starts none after it", async () => {
    const deadline = new CommandDeadline(30);
    const attempt = vi.fn(() => new Promise<undefined>(() => {}));
    await expect(pollUntilDeadline(deadline, attempt)).resolves.toBeUndefined();
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it.each(["rpc_error", "provider_rate_limited"])(
    "treats a %s attempt as not yet",
    async (code) => {
      const deadline = new CommandDeadline(0);
      const attempt = vi
        .fn<(signal: AbortSignal) => Promise<string | undefined>>()
        .mockRejectedValueOnce(new ChainError(code, "node busy"))
        .mockResolvedValueOnce("ok");
      vi.useFakeTimers();
      try {
        const result = pollUntilDeadline(deadline, attempt);
        await vi.advanceTimersByTimeAsync(1_500);
        await expect(result).resolves.toBe("ok");
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it.each([new ChainError("not_found", "gone"), new Error("unclassified")])(
    "stops at once on %s, also without a time limit",
    async (error) => {
      const attempt = vi.fn(async () => {
        throw error;
      });
      await expect(pollUntilDeadline(new CommandDeadline(0), attempt)).rejects.toBe(error);
      expect(attempt).toHaveBeenCalledTimes(1);
    },
  );

  it("treats an error raised by deadline expiry as the end of the wait", async () => {
    const clock = { now: () => 0 };
    const deadline = new CommandDeadline(10, 0, clock);
    deadline.dispose();
    const attempt = vi.fn(async () => {
      clock.now = () => 10;
      throw new ChainError("not_found", "aborted by the deadline");
    });
    await expect(pollUntilDeadline(deadline, attempt)).resolves.toBeUndefined();
  });

  it("makes no attempt when the deadline has already expired", async () => {
    const clock = { now: () => 0 };
    const deadline = new CommandDeadline(10, 0, clock);
    clock.now = () => 10;
    const attempt = vi.fn(async () => "never");
    await expect(pollUntilDeadline(deadline, attempt)).resolves.toBeUndefined();
    expect(attempt).not.toHaveBeenCalled();
  });
});

describe("sleepWithin", () => {
  // A deadline whose remaining time and expiry come from the test.
  function deadlineOf(remainingMs: () => number, expired: () => boolean): ExecutionDeadline {
    return {
      signal: new AbortController().signal,
      remainingMs,
      expired,
      assertActive: () => {},
    } as unknown as ExecutionDeadline;
  }

  async function settled(promise: Promise<boolean>) {
    let value: boolean | undefined;
    void promise.then((v) => (value = v));
    await Promise.resolve();
    return value;
  }

  it("gives false when the shortened timer fires before the deadline's clock says it expired", async () => {
    vi.useFakeTimers();
    try {
      const start = Date.now();
      let first = true;
      // The first timer is armed 5 ms short of the deadline's clock.
      const deadline = deadlineOf(
        () => (first ? ((first = false), 100) : Math.max(0, 105 - (Date.now() - start))),
        () => Date.now() - start >= 105,
      );
      const slept = sleepWithin(deadline, 1500);
      await vi.advanceTimersByTimeAsync(100);
      expect(await settled(slept)).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1500);
      await expect(slept).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives true once the whole interval passed within the deadline", async () => {
    vi.useFakeTimers();
    try {
      const start = Date.now();
      const slept = sleepWithin(
        deadlineOf(
          () => 10_000 - (Date.now() - start),
          () => false,
        ),
        1500,
      );
      await vi.advanceTimersByTimeAsync(1499);
      expect(await settled(slept)).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      await expect(slept).resolves.toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ends after the interval while the deadline is paused", async () => {
    vi.useFakeTimers();
    try {
      const slept = sleepWithin(
        deadlineOf(
          () => 200,
          () => false,
        ),
        1500,
      );
      await vi.advanceTimersByTimeAsync(1400);
      expect(await settled(slept)).toBeUndefined();
      await vi.advanceTimersByTimeAsync(100);
      await expect(slept).resolves.toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives false at once when the deadline expires during the sleep", async () => {
    const deadline = new CommandDeadline(30);
    const started = performance.now();
    await expect(sleepWithin(deadline, 5_000)).resolves.toBe(false);
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});
