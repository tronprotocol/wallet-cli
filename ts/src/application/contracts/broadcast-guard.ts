import { ExecutionError } from "../../domain/errors/index.js";

// Every submit or payment adapter calls assertAllowed() immediately before its side effect.
export interface BroadcastGuard {
  assertAllowed(): void;
}

// Fail closed when a submitting adapter is constructed without the process guard.
export const UNWIRED_BROADCAST_GUARD: BroadcastGuard = {
  assertAllowed() {
    throw new ExecutionError(
      "internal_error",
      "no broadcast guard is wired to this adapter; nothing was submitted",
    );
  },
};
