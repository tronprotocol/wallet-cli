import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeadlineExpiredError } from "../contracts/deadline.js";
import {
  CommandDeadline,
  SUBMIT_ADMISSION_RESERVE_MS,
  assertSubmitAdmitted,
  endedByDeadline,
  submitDispatchCheck,
  unlessDeadline,
} from "./command-deadline.js";

function manualClock(start = 0) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("CommandDeadline", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("aborts its one signal with a timeout once the limit has passed", async () => {
    const clock = manualClock();
    const deadline = new CommandDeadline(1000, 0, clock);
    const signal = deadline.signal;
    clock.advance(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(deadline.signal).toBe(signal);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBeInstanceOf(DeadlineExpiredError);
    expect((signal.reason as DeadlineExpiredError).code).toBe("timeout");
    expect(deadline.remainingMs()).toBe(0);
  });

  it("counts from the given start, not from construction", () => {
    const clock = manualClock(500);
    const deadline = new CommandDeadline(1000, 0, clock);
    expect(deadline.remainingMs()).toBe(500);
  });

  it("reports expiry from elapsed time before a stale timer fires", () => {
    const clock = manualClock();
    const deadline = new CommandDeadline(1000, 0, clock);
    clock.advance(1001);
    expect(deadline.expired()).toBe(true);
    expect(() => deadline.assertActive()).toThrow(DeadlineExpiredError);
    expect(deadline.signal.aborted).toBe(true);
  });

  it("re-arms when the timer fires before the clock reaches the limit", async () => {
    const clock = manualClock();
    const deadline = new CommandDeadline(1000, 0, clock);
    await vi.advanceTimersByTimeAsync(1000);
    expect(deadline.signal.aborted).toBe(false);
    clock.advance(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(deadline.signal.aborted).toBe(true);
  });

  it("stops the clock while paused and resumes after the last of nested pauses", async () => {
    const clock = manualClock();
    const deadline = new CommandDeadline(1000, 0, clock);
    clock.advance(400);
    const outer = deadline.pause();
    const inner = deadline.pause();
    clock.advance(10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(deadline.remainingMs()).toBe(600);
    inner();
    inner();
    clock.advance(10_000);
    expect(deadline.expired()).toBe(false);
    outer();
    clock.advance(599);
    expect(deadline.remainingMs()).toBe(1);
    clock.advance(1);
    await vi.advanceTimersByTimeAsync(600);
    expect(deadline.signal.aborted).toBe(true);
  });

  it("never revives an expired deadline", () => {
    const clock = manualClock();
    const deadline = new CommandDeadline(1000, 0, clock);
    clock.advance(1000);
    expect(deadline.expired()).toBe(true);
    const resume = deadline.pause();
    resume();
    expect(deadline.expired()).toBe(true);
    expect(deadline.remainingMs()).toBe(0);
  });

  it("treats 0 as no limit", async () => {
    const clock = manualClock();
    const deadline = new CommandDeadline(0, 0, clock);
    clock.advance(2 ** 40);
    await vi.advanceTimersByTimeAsync(2 ** 31);
    expect(deadline.remainingMs()).toBe(Number.POSITIVE_INFINITY);
    expect(deadline.expired()).toBe(false);
    expect(deadline.signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops limiting once released, but keeps an expired deadline expired", () => {
    const clock = manualClock();
    const live = new CommandDeadline(1000, 0, clock);
    live.release();
    clock.advance(5000);
    expect(live.expired()).toBe(false);
    expect(live.remainingMs()).toBe(Number.POSITIVE_INFINITY);
    expect(vi.getTimerCount()).toBe(0);
    const spent = new CommandDeadline(1000, 0, clock);
    clock.advance(1000);
    spent.release();
    expect(spent.expired()).toBe(true);
  });

  it("clears its timer on dispose", () => {
    const deadline = new CommandDeadline(1000, 0, manualClock());
    expect(vi.getTimerCount()).toBe(1);
    deadline.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("submit admission", () => {
  const at = (remaining: number) => {
    const clock = manualClock();
    const deadline = new CommandDeadline(10_000, 0, clock);
    clock.advance(10_000 - remaining);
    return deadline;
  };

  it("refuses below the reserve and admits at it", () => {
    expect(() => assertSubmitAdmitted(at(SUBMIT_ADMISSION_RESERVE_MS - 1))).toThrow(
      DeadlineExpiredError,
    );
    expect(() => assertSubmitAdmitted(at(SUBMIT_ADMISSION_RESERVE_MS))).not.toThrow();
    expect(() => assertSubmitAdmitted(at(SUBMIT_ADMISSION_RESERVE_MS + 1))).not.toThrow();
  });

  it("admits without a limit", () => {
    expect(() => assertSubmitAdmitted(new CommandDeadline(0))).not.toThrow();
  });

  it("re-checks at dispatch after a queue delay", () => {
    const clock = manualClock();
    const deadline = new CommandDeadline(10_000, 0, clock);
    const check = submitDispatchCheck(deadline);
    expect(() => check.assertDispatchable()).not.toThrow();
    clock.advance(8_001);
    expect(() => check.assertDispatchable()).toThrow(DeadlineExpiredError);
    expect(check.signal).toBe(deadline.signal);
  });
});

describe("endedByDeadline", () => {
  it("recognises the deadline error and any error after expiry", () => {
    const clock = manualClock();
    const deadline = new CommandDeadline(1000, 0, clock);
    expect(endedByDeadline(new DeadlineExpiredError(), deadline)).toBe(true);
    expect(endedByDeadline(new Error("node refused"), deadline)).toBe(false);
    clock.advance(1000);
    expect(endedByDeadline(new Error("aborted"), deadline)).toBe(true);
  });
});

describe("unlessDeadline", () => {
  it("gives the fallback for other errors and rethrows deadline expiry", () => {
    const clock = manualClock();
    const deadline = new CommandDeadline(1000, 0, clock);
    const handler = unlessDeadline(deadline, () => "fallback");
    expect(handler(new Error("node refused"))).toBe("fallback");
    const expired = new DeadlineExpiredError();
    expect(() => handler(expired)).toThrow(expired);
    clock.advance(1000);
    const late = new Error("aborted after dispatch");
    expect(() => handler(late)).toThrow(late);
    deadline.dispose();
  });
});
