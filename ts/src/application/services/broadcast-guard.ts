// Process-wide guard; callers must not overlap or nest barred sections.
import { ExecutionError } from "../../domain/errors/index.js";
import type { BroadcastGuard } from "../contracts/broadcast-guard.js";

let barred: string | undefined;

export async function barBroadcasts<T>(reason: string, fn: () => Promise<T>): Promise<T> {
  barred = reason;
  try {
    return await fn();
  } finally {
    barred = undefined;
  }
}

// Broadcasters must call this before submitting.
export function assertBroadcastAllowed(): void {
  if (barred === undefined) return;
  throw new ExecutionError(
    "dry_run_violation",
    `${barred} reached the broadcast path; nothing was submitted. This is a bug in the command's family binding, not in your input — please report it.`,
  );
}

export const processBroadcastGuard: BroadcastGuard = { assertAllowed: assertBroadcastAllowed };
