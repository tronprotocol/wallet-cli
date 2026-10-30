import { describe, expect, it, vi } from "vitest";
import { pollWithinWaitBudget } from "./wait-budget.js";

describe("pollWithinWaitBudget", () => {
  it("gives each attempt a signal that aborts when the budget runs out", async () => {
    const signals: Array<AbortSignal | undefined> = [];
    const result = await pollWithinWaitBudget(30, (signal) => {
      signals.push(signal);
      return new Promise<undefined>((resolve) =>
        signal?.addEventListener("abort", () => resolve(undefined)),
      );
    });

    expect(result).toBeUndefined();
    expect(signals).toHaveLength(1);
    expect(signals[0]?.aborted).toBe(true);
  });

  it("starts no attempt after the deadline", async () => {
    const attempt = vi.fn(async () => undefined);

    expect(await pollWithinWaitBudget(30, attempt)).toBeUndefined();
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("still makes one attempt, unbounded by the wait, when the budget is zero", async () => {
    const attempt = vi.fn(async (_signal: AbortSignal | undefined) => "done");

    expect(await pollWithinWaitBudget(0, attempt)).toBe("done");
    expect(attempt).toHaveBeenCalledWith(undefined);
  });

  it("returns the first value an attempt yields", async () => {
    let calls = 0;
    const result = await pollWithinWaitBudget(5_000, async () =>
      ++calls === 2 ? "seen" : undefined,
    );

    expect(result).toBe("seen");
    expect(calls).toBe(2);
  });
});
