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
 */
import { UsageError } from "../../domain/errors/index.js";

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
    throw new UsageError(
      "invalid_option",
      `the node could not estimate gas for this transaction; pass --gas-limit to proceed. The node said: ${(e as Error).message}`,
    );
  }
}
