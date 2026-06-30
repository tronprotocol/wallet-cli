/**
 * RpcProvider — owns per-network caching of the concrete chain clients. Construction is
 * injected per family (the factory map comes from FAMILY_REGISTRY), so this
 * stays free of any `family === …` switch and infrastructure never imports the bootstrap registry. The descriptor stays
 * pure data; the live client is reached here, keyed by network id.
 *
 * Two access modes:
 *   - tron(net): guarded, family-typed — for family-specific command files that need the
 *     full concrete client API. The guard fails fast on a composition mismatch (internal_error).
 *   - client(net): family-agnostic — for generic callers that only touch a shared method
 *     (e.g. getNativeBalance). The pipeline reaches broadcast via the Broadcaster role below.
 */
import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import type { ChainFamily } from "../../../../domain/family/index.js";
import { ExecutionError } from "../../../../domain/errors/index.js";
import type {
  AnyChainGateway,
  ChainGatewayMap,
  ChainGatewayProvider,
} from "../../../../application/ports/chain/gateway-provider.js";

type GatewayFactory = (network: NetworkDescriptor) => AnyChainGateway;

export class ChainGatewayRegistry implements ChainGatewayProvider {
  #cache = new Map<string, AnyChainGateway>();

  constructor(private readonly factories: Record<ChainFamily, GatewayFactory>) {}

  /** family-agnostic accessor: the concrete client typed as the union (call shared methods only). */
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
    if (!factory) throw new ExecutionError("internal_error", `no RPC client for family ${net.family}`);
    return factory(net);
  }
}
