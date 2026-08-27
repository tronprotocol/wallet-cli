/**
 * Resolving an EVM gas limit — one place, because there is one correct answer to "the node would
 * not estimate this".
 *
 * The estimate used to be wrapped in `.catch(() => undefined)`, with `tx send` falling back to
 * 21000 and `contract send` reporting a bare "could not estimate". Both hid the node's reply, and
 * 21000 is the intrinsic cost of a plain value transfer — for anything carrying calldata it is a
 * transaction that cannot succeed, signed and reported as if it could.
 *
 * A failed estimate is almost always the node telling you something true: the call reverts, the
 * account cannot cover it, the contract is not what you think. That message is the useful part,
 * so it is carried through rather than replaced by a guess.
 *
 * What it is NOT is a bad command line. Every failure here used to become `invalid_option`, i.e.
 * exit 2 — the code that means "fix your invocation". An unreachable endpoint, an HTTP 503 and a
 * timeout all landed there, so a caller retrying on exit 1 and giving up on exit 2 gave up on a
 * transient network failure. The suggestion to pass `--gas-limit` is worth making either way, but
 * it does not turn a node outage into a typo: the original code and exit class are kept, and only
 * the way out is appended.
 */
import { ChainError, CliError, UsageError } from "../../domain/errors/index.js";

interface GasEstimator {
  estimateGas(tx: Record<string, unknown>): Promise<string>;
}

/**
 * `override` (from `--gas-limit`) wins without contacting the node — it is the documented way to
 * proceed when an estimate is impossible, and asking anyway would fail for a value nobody uses.
 */
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
    // A typed error already says what happened (rpc_error, timeout, …) and which exit class it
    // belongs to. Rebuilding it with the same code keeps both and still points at the way out.
    if (e instanceof CliError) {
      const message = `${e.message}; ${way}`;
      // Same kind, not just the same code: kind is what decides exit 1 vs exit 2, and a usage
      // error arriving from below is still a usage error.
      throw e.kind === "usage"
        ? new UsageError(e.code, message, e.details)
        : new ChainError(e.code, message, e.details);
    }
    // Anything else would be redacted to a bare internal_error at the top level, taking the node's
    // words with it — and those words are the reason this function does not guess.
    throw new ChainError(
      "rpc_error",
      `the node could not estimate gas for this transaction; ${way}. The node said: ${(e as Error).message}`,
    );
  }
}
