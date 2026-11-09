import {
  DeadlineExpiredError,
  type DispatchCheck,
} from "../../../../application/contracts/deadline.js";

// A check whose deadline has already passed.
export function expiredCheck(): DispatchCheck {
  const reason = new DeadlineExpiredError();
  return {
    signal: AbortSignal.abort(reason),
    assertDispatchable() {
      throw reason;
    },
  };
}

// A request check whose deadline expires after `ms`.
export function expiringCheck(ms: number): DispatchCheck {
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DeadlineExpiredError()), ms);
  return {
    signal: controller.signal,
    assertDispatchable() {
      if (controller.signal.aborted) throw controller.signal.reason;
    },
  };
}
