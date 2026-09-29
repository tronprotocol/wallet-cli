import type { AccountScope } from "../contracts/execution-scope.js";
import { UsageError } from "../../domain/errors/index.js";

/** TRON-only commands cannot resolve a family mismatch by switching to an EVM network. */
export function resolveTronAccount(scope: AccountScope): string {
  try {
    return scope.resolveAddress("tron");
  } catch (error) {
    if (error instanceof UsageError && error.code === "family_mismatch")
      throw new UsageError(
        "family_mismatch",
        "this command supports TRON only; select an account with a TRON address using --account, or switch the active account",
      );
    throw error;
  }
}
