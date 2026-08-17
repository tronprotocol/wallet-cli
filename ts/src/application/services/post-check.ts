import { redactErrorMessage } from "../../domain/errors/redact.js";
import type { TransactionScope } from "../contracts/execution-scope.js";

/**
 * Run a verification read AFTER the transaction is already confirmed on chain.
 *
 * By this point the operation is irreversible and has usually cost a fee. A timeout, a 429, or a
 * node that has not caught up yet must never turn that confirmed receipt into a command failure:
 * callers would retry an operation that already succeeded. Both an unreadable check and a genuine
 * mismatch degrade to a warning so the txid always survives — the same rule TxPipeline applies to
 * its `confirm` hook, which these post-checks sit outside of.
 *
 * `check` resolves to a mismatch description, or undefined when the state verified cleanly.
 */
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
