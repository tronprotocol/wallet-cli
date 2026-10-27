import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import { ChainError } from "../../../../domain/errors/index.js";

const REVERTED = new Set(["execution_reverted", "provider_error"]);

// Missing NFT reads can surface as reverts or empty-result provider errors.
export async function readPosition<T>(
  protocol: "V3" | "V4",
  tokenId: string,
  network: NetworkDescriptor,
  read: () => Promise<T>,
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof ChainError && REVERTED.has(error.code)) {
      throw new ChainError(
        "position_not_found",
        `no ${protocol} position with id ${tokenId} on ${network.id}`,
      );
    }
    throw error;
  }
}
