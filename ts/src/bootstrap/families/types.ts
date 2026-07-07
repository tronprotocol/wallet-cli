import type { NetworkDescriptor, SignStrategy } from "../../domain/types/index.js";
import type { ChainFamily, FamilyMeta } from "../../domain/family/index.js";
import type { ChainGatewayMap } from "../../application/ports/chain/gateway-provider.js";

export interface FamilyPlugin<F extends ChainFamily> {
  readonly meta: FamilyMeta & { family: F };
  readonly signStrategy: SignStrategy;
  createGateway(network: NetworkDescriptor, timeoutMs: number): ChainGatewayMap[F];
}

export type AnyFamilyPlugin = {
  [F in ChainFamily]: FamilyPlugin<F>
}[ChainFamily];
