// Never substitute a guessed gas limit for a failed estimate.
import { ChainError, CliError, UsageError } from "../../domain/errors/index.js";

interface GasEstimator {
  estimateGas(tx: Record<string, unknown>): Promise<string>;
}

export async function resolveGasLimit(
  gateway: GasEstimator,
  request: Record<string, unknown>,
  override?: string,
): Promise<string> {
  if (override !== undefined) return override;
  try {
    return await gateway.estimateGas(request);
  } catch (e) {
    const way = "pass --gas-limit to proceed without an estimate";
    if (e instanceof CliError) {
      const message = `${e.message}; ${way}`;
      // Preserve kind: codes marked "either" derive their exit class from it.
      throw e.kind === "usage"
        ? new UsageError(e.code, message, e.details)
        : new ChainError(e.code, message, e.details);
    }
    // Preserve the node’s reason instead of letting an untyped error become internal_error.
    throw new ChainError(
      "rpc_error",
      `the node could not estimate gas for this transaction; ${way}. The node said: ${(e as Error).message}`,
    );
  }
}
