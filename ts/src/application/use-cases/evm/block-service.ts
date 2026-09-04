import { ChainError } from "../../../domain/errors/index.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";

/** The node's block object, passed through unchanged — the sibling of TronBlockService. */
export class EvmBlockService {
  constructor(private readonly gateways: ChainGatewayProvider) {}

  /**
   * `null` from the gateway means the node answered `eth_getBlockByNumber` with `result: null` —
   * a genuine "no such block" (a malformed answer, missing `result` entirely, is thrown by the
   * gateway itself and never reaches here). What that `null` means depends on whether a height
   * was asked for:
   *   - a specific height → the node is stating a fact about the chain: `not_found`.
   *   - no height (latest) → there is no such thing as "the chain has no latest block"; a null
   *     answer here is the node giving a bad response, not a fact, so it is `invalid_node_response`.
   */
  async get(network: NetworkDescriptor, number?: string) {
    const block = await this.gateways.get(network, "evm").getBlock(number);
    if (block === null) {
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
