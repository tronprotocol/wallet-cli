import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import type { ChainFamily } from "../../../../domain/family/index.js";
import { ExecutionError } from "../../../../domain/errors/index.js";
import type {
  AnyChainGateway,
  ChainGatewayMap,
  ChainGatewayProvider,
} from "../../../../application/ports/chain/gateway-provider.js";

type GatewayFactory = (network: NetworkDescriptor, timeoutMs: number) => AnyChainGateway;

export class ChainGatewayRegistry implements ChainGatewayProvider {
  #cache = new Map<string, AnyChainGateway>();

  constructor(
    private readonly factories: Record<ChainFamily, GatewayFactory>,
    private readonly timeoutMs: number,
  ) {}

  client(net: NetworkDescriptor): AnyChainGateway {
    const hit = this.#cache.get(net.id);
    if (hit) return hit;
    const client = this.#make(net);
    this.#cache.set(net.id, client);
    return client;
  }

  get<F extends ChainFamily>(net: NetworkDescriptor, family: F): ChainGatewayMap[F] {
    if (net.family !== family) {
      throw new ExecutionError(
        "internal_error",
        `gateway family mismatch: requested ${family} for ${net.id} (${net.family})`,
      );
    }
    return this.client(net) as ChainGatewayMap[F];
  }

  #make(net: NetworkDescriptor): AnyChainGateway {
    const factory = this.factories[net.family];
    if (!factory)
      throw new ExecutionError("internal_error", `no RPC client for family ${net.family}`);
    return factory(net, this.timeoutMs);
  }
}
