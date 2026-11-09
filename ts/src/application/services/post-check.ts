import { redactErrorMessage } from "../../domain/errors/redact.js";
import type { TransactionScope } from "../contracts/execution-scope.js";

// After confirmation, warn on read failures or mismatches to avoid encouraging duplicate payments.
// `check` returns a mismatch description, or undefined on success.
export async function warnOnPostCheck(
  scope: TransactionScope,
  code: string,
  check: () => Promise<string | undefined>,
): Promise<void> {
  let mismatch: string | undefined;
  try {
    mismatch = await check();
  } catch (error) {
    scope.warn({
      code: `${code}_unavailable`,
      message: `the transaction is confirmed on chain, but the follow-up check could not be read: ${redactErrorMessage(
        error instanceof Error ? error.message : String(error),
      )}`,
    });
    return;
  }
  if (mismatch) scope.warn({ code: `${code}_mismatch`, message: mismatch });
}
