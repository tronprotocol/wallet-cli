import { ChainError } from "../../../domain/errors/index.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";

export class TronBlockService {
  constructor(private readonly gateways: ChainGatewayProvider) {}

  /**
   * A real TRON block always carries `blockID`; a height the node has no record of comes back as
   * `{}` (confirmed against Nile: `getnowblock`/`getblockbynum` answer `success` at exit 0 either
   * way, so the shape of the body — not a transport failure — is the only signal available). What
   * a missing `blockID` means depends on whether a height was asked for:
   *   - a specific height → the node is stating a fact about the chain: `not_found`.
   *   - no height (latest) → there is no such thing as "the chain has no latest block"; an empty
   *     answer here is the node giving a bad response, not a fact, so it is `invalid_node_response`
   *     (same reasoning as the EVM half of this fix, see block-service.ts there).
   */
  async get(network: NetworkDescriptor, number?: string) {
    const block = await this.gateways.get(network, "tron").getBlock(number);
    if (block === null || typeof block !== "object" || !("blockID" in block)) {
      throw number === undefined
        ? new ChainError(
            "invalid_node_response",
            `the node reported no latest block on ${network.id}`,
          )
        : new ChainError(
            "not_found",
            `block ${number} is unknown to this endpoint on ${network.id}; public nodes often ` +
              "prune or partition history, so this may mean the node has no record of it rather " +
              "than that it never existed",
          );
    }
    return { block };
  }
}
