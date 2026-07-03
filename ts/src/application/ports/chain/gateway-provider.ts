import type { ChainFamily } from "../../../domain/family/index.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { TronGateway } from "./tron-gateway.js";

export interface NativeBalanceReader {
  getNativeBalance(address: string): Promise<string>;
}

/** Family-keyed extension point. Add each new family gateway here without widening other ports. */
export interface ChainGatewayMap {
  tron: TronGateway;
}

export type AnyChainGateway = ChainGatewayMap[ChainFamily];

export interface ChainGatewayProvider {
  client(network: NetworkDescriptor): NativeBalanceReader;
  get<F extends ChainFamily>(network: NetworkDescriptor, family: F): ChainGatewayMap[F];
}
