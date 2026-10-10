import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import { ChainError } from "../../../../domain/errors/index.js";

/** The error codes that mean "the contract answered, and the answer was a refusal". */
const REVERTED = new Set(["execution_reverted", "provider_error"]);

/**
 * A position read, with "there is no such position" separated from "the node did not answer".
 *
 * `ownerOf` on an id that was never minted REVERTS, and a revert reaches here as a provider
 * error — which would tell a caller the service is broken when their id is simply wrong. The one
 * thing this must not do is turn a genuine outage into `position_not_found`, so only a failed
 * read of THIS id is reinterpreted.
 *
 * Shared by every command that names a position — position-info, add-, remove-liquidity and
 * collect-fees — so the same wrong id is the same error wherever it is typed.
 */
export async function readPosition<T>(
  protocol: "V3" | "V4",
  tokenId: string,
  network: NetworkDescriptor,
  read: () => Promise<T>,
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    // ONLY a revert. An id that was never minted reverts `ownerOf` — measured on mainnet, where
    // V4 id 99999999 answers `NOT_MINTED`, and on Nile, where V3 answers `Invalid token ID` — and an
    // empty `constant_result` surfaces as `provider_error`. A timeout, a rate limit or a transport
    // failure keeps its own code and its own exit class: "no such position" is a different thing to
    // tell a caller than "nobody answered", and a caller who is told the first will stop retrying.
    if (error instanceof ChainError && REVERTED.has(error.code)) {
      throw new ChainError(
        "position_not_found",
        `no ${protocol} position with id ${tokenId} on ${network.id}`,
      );
    }
    throw error;
  }
}
