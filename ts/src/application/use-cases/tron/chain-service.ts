import { requestDispatchCheck } from "../../services/command-deadline.js";
import { systemWallClock, type WallClock } from "../../contracts/wall-clock.js";
import type { ExecutionDeadline } from "../../contracts/deadline.js";
import { endpointHost, type NetworkDescriptor } from "../../../domain/types/index.js";
import { ChainError, UsageError } from "../../../domain/errors/index.js";
import { chainParameterByName } from "../../../domain/tron/governance/chain-parameters.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronPricePoint } from "../../ports/chain/tron/tron-gateway.js";

// Nine seconds is about three TRON block intervals.
const IN_SYNC_WINDOW_MS = 9_000;

function priceView(timeline: TronPricePoint[]) {
  return {
    currentSunPerUnit: timeline.at(-1)!.sunPerUnit,
    history: timeline.map((point) => ({ since: point.sinceMs, price: point.sunPerUnit })),
  };
}

export class TronChainService {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly now: WallClock = systemWallClock,
  ) {}

  async params(deadline: ExecutionDeadline, network: NetworkDescriptor, key?: string) {
    const params = (
      await this.gateways.get(network, "tron", requestDispatchCheck(deadline)).getChainParameters()
    ).map((param) => ({
      ...param,
      unit: chainParameterByName(param.key)?.unit ?? "",
    }));
    if (key === undefined) return { params };
    const hit = params.find((p) => p.key === key);
    if (!hit) throw new UsageError("unknown_parameter", `unknown chain parameter: ${key}`);
    return { key: hit.key, value: hit.value, unit: hit.unit };
  }

  async prices(deadline: ExecutionDeadline, network: NetworkDescriptor) {
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(deadline));
    const [energy, bandwidth, params] = await Promise.all([
      gateway.getEnergyPrices(),
      gateway.getBandwidthPrices(),
      gateway.getChainParameters(),
    ]);
    const memo = params.find((p) => p.key === "getMemoFee")?.value;
    if (memo !== undefined && memo < 0) {
      throw new ChainError("provider_error", "chain parameter is unavailable: getMemoFee");
    }
    return {
      energy: priceView(energy),
      bandwidth: priceView(bandwidth),
      memoFeeSun: String(memo ?? 0),
    };
  }

  async node(deadline: ExecutionDeadline, network: NetworkDescriptor) {
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(deadline));
    const [info, head] = await Promise.all([gateway.getNodeInfo(), gateway.getHeadBlock()]);
    const solidNumber = info.solidBlockNumber ?? null;
    return {
      // Endpoint paths and queries may contain API keys.
      endpoint: endpointHost(network.httpEndpoint) || null,
      version: info.codeVersion ? `java-tron ${info.codeVersion}` : null,
      p2pVersion: info.p2pVersion ?? null,
      headBlock: { number: head.number, timestamp: head.timestampMs },
      solidBlock: solidNumber === null ? null : { number: solidNumber },
      lagBlocks: solidNumber === null ? null : head.number - solidNumber,
      inSync: this.now() - head.timestampMs <= IN_SYNC_WINDOW_MS,
      peers: info.peers ?? null,
    };
  }
}
