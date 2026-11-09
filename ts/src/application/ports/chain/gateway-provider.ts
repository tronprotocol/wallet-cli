import type { DispatchCheck } from "../../contracts/deadline.js";
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

// Every call on a returned gateway runs under `check`; a submit method takes its own check.
export interface ChainGatewayProvider {
  client(network: NetworkDescriptor, check: DispatchCheck): NativeBalanceReader;
  get<F extends ChainFamily>(
    network: NetworkDescriptor,
    family: F,
    check: DispatchCheck,
  ): ChainGatewayMap[F];
}
