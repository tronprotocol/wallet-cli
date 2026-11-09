import { requestDispatchCheck } from "../../services/command-deadline.js";
import type { ExecutionDeadline } from "../../contracts/deadline.js";
import { ChainError } from "../../../domain/errors/index.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";

export class EvmBlockService {
  constructor(private readonly gateways: ChainGatewayProvider) {}

  // Null at a specific height means not found; null for latest is an invalid node response.
  async get(deadline: ExecutionDeadline, network: NetworkDescriptor, number?: string) {
    const block = await this.gateways
      .get(network, "evm", requestDispatchCheck(deadline))
      .getBlock(number);
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
    return {
      block: block.raw,
      number: block.number,
      // RPC seconds become milliseconds in this view.
      timestamp: block.timestamp * 1000,
      ...(block.hash === undefined ? {} : { hash: block.hash }),
      ...(block.parentHash === undefined ? {} : { parentHash: block.parentHash }),
      ...(block.transactionCount === undefined ? {} : { transactionCount: block.transactionCount }),
      ...(block.gasUsed === undefined ? {} : { gasUsed: block.gasUsed }),
      ...(block.gasLimit === undefined ? {} : { gasLimit: block.gasLimit }),
      ...(block.baseFeeWei === undefined ? {} : { baseFeeWei: block.baseFeeWei }),
    };
  }
}
