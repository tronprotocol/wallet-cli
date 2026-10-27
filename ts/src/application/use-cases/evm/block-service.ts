import { ChainError } from "../../../domain/errors/index.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";

export class EvmBlockService {
  constructor(private readonly gateways: ChainGatewayProvider) {}

  // Null at a specific height means not found; null for latest is an invalid node response.
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
