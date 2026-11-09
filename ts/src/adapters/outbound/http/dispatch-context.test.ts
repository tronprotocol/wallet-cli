import { describe, expect, it, vi } from "vitest";
import {
  abortableDelay,
  activeDispatch,
  bindDispatchCheck,
  dispatchNow,
  untilAborted,
  withDispatchCheck,
} from "./dispatch-context.js";
import {
  DeadlineExpiredError,
  type DispatchCheck,
} from "../../../application/contracts/deadline.js";
import { TransportError } from "../../../domain/errors/index.js";

function controlledCheck(): { check: DispatchCheck; expire: () => void } {
  const controller = new AbortController();
  return {
    check: { signal: controller.signal, assertDispatchable: () => {} },
    expire: () => controller.abort(new DeadlineExpiredError()),
  };
}

describe("untilAborted", () => {
  it("passes the result through when the call settles first", async () => {
    const { check } = controlledCheck();
    await expect(
      withDispatchCheck(check, () => untilAborted(Promise.resolve(7), "x")),
    ).resolves.toBe(7);
  });

  it("rejects with the deadline error when nothing was sent, and observes the late result", async () => {
    const { check, expire } = controlledCheck();
    let fail: (error: Error) => void = () => {};
    const late = new Promise<never>((_resolve, reject) => (fail = reject));
    const pending = withDispatchCheck(check, () => untilAborted(late, "x"));
    expire();
    await expect(pending).rejects.toBeInstanceOf(DeadlineExpiredError);
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    fail(new Error("late"));
    await new Promise((resolve) => setImmediate(resolve));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("rejects with a transport timeout once a request of the call was sent", async () => {
    const { check, expire } = controlledCheck();
    const pending = withDispatchCheck(check, () => {
      dispatchNow(activeDispatch());
      return untilAborted(new Promise(() => {}), "TRON broadcast");
    });
    expire();
    const error = await pending.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransportError);
    expect(error).toMatchObject({ code: "timeout" });
  });

  it("refuses at once when the signal has already aborted", async () => {
    const { check, expire } = controlledCheck();
    expire();
    await expect(
      withDispatchCheck(check, () => untilAborted(new Promise(() => {}), "x")),
    ).rejects.toBeInstanceOf(DeadlineExpiredError);
  });
});

describe("bindDispatchCheck", () => {
  it("runs every method call under the bound check, and keeps `this` on the target", async () => {
    const { check } = controlledCheck();
    const target = {
      value: 3,
      async read() {
        await Promise.resolve();
        return { check: activeDispatch()?.check, value: this.value };
      },
    };
    const bound = bindDispatchCheck(target, check);
    expect(bound.value).toBe(3);
    await expect(bound.read()).resolves.toEqual({ check, value: 3 });
    expect(activeDispatch()).toBeUndefined();
  });
});

describe("dispatchNow", () => {
  it("runs the check and marks the call as sent only when it passes", () => {
    const refusal = new DeadlineExpiredError();
    const refused = {
      check: {
        signal: new AbortController().signal,
        assertDispatchable: () => {
          throw refusal;
        },
      },
      dispatched: false,
    };
    expect(() => dispatchNow(refused)).toThrow(refusal);
    expect(refused.dispatched).toBe(false);
    const { check } = controlledCheck();
    const allowed = { check, dispatched: false };
    dispatchNow(allowed);
    expect(allowed.dispatched).toBe(true);
  });
});

describe("abortableDelay", () => {
  it("ends the wait with the signal's reason", async () => {
    const controller = new AbortController();
    const waiting = abortableDelay(60_000, controller.signal);
    const reason = new DeadlineExpiredError();
    controller.abort(reason);
    await expect(waiting).rejects.toBe(reason);
  });
});
