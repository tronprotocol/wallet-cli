import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";

export class TronBlockService {
  constructor(private readonly gateways: ChainGatewayProvider) {}

  async get(network: NetworkDescriptor, number?: number) {
    return { block: await this.gateways.get(network, "tron").getBlock(number) };
  }
}
