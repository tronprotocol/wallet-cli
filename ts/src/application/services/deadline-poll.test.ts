import { describe, expect, it, vi } from "vitest";
import { ChainError } from "../../domain/errors/index.js";
import { CommandDeadline } from "./command-deadline.js";
import { pollUntilDeadline } from "./deadline-poll.js";

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
