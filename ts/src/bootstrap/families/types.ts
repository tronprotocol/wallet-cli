import type { NetworkDescriptor, SignStrategy } from "../../domain/types/index.js";
import type { ChainModule } from "../../adapters/inbound/cli/contracts/index.js";
import type { ChainFamily, FamilyMeta } from "../../domain/family/index.js";
import type {
  ChainGatewayMap,
  ChainGatewayProvider,
} from "../../application/ports/chain/gateway-provider.js";
import type { PriceProvider } from "../../application/ports/price-provider.js";
import type { TokenRepository } from "../../application/ports/token-repository.js";
import type { SignerResolver } from "../../application/services/signer/index.js";
import type { TxPipeline } from "../../application/services/pipeline/index.js";

export interface FamilyApplicationDependencies {
  gateways: ChainGatewayProvider;
  tokens: TokenRepository;
  prices: PriceProvider;
  signers: SignerResolver;
  transactions: TxPipeline;
}

export interface FamilyPlugin<F extends ChainFamily> {
  readonly meta: FamilyMeta & { family: F };
  readonly signStrategy: SignStrategy;
  createGateway(network: NetworkDescriptor): ChainGatewayMap[F];
  createModule(dependencies: FamilyApplicationDependencies): ChainModule;
}

export type AnyFamilyPlugin = {
  [F in ChainFamily]: FamilyPlugin<F>
}[ChainFamily];
