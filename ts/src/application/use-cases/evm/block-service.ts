import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";

/** The node's block object, passed through unchanged — the sibling of TronBlockService. */
export class EvmBlockService {
  constructor(private readonly gateways: ChainGatewayProvider) {}

  async get(network: NetworkDescriptor, number?: string) {
    return { block: await this.gateways.get(network, "evm").getBlock(number) };
  }
}
