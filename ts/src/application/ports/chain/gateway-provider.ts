import type { ChainFamily } from "../../../domain/family/index.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { EvmGateway } from "./evm/evm-gateway.js";
import type { NativeBalanceReader } from "./native-balance-reader.js";
import type { TronGateway } from "./tron/tron-gateway.js";

export interface ChainGatewayMap {
  tron: TronGateway;
  evm: EvmGateway;
}

export type AnyChainGateway = ChainGatewayMap[ChainFamily];

export interface ChainGatewayProvider {
  client(network: NetworkDescriptor): NativeBalanceReader;
  get<F extends ChainFamily>(network: NetworkDescriptor, family: F): ChainGatewayMap[F];
}
