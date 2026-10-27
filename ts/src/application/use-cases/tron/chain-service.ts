import { endpointHost, type NetworkDescriptor } from "../../../domain/types/index.js";
import { UsageError } from "../../../domain/errors/index.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";

// Nine seconds is about three TRON block intervals.
const IN_SYNC_WINDOW_MS = 9_000;

// Node format: timestamp:price pairs; the final pair is current.
function parsePriceTimeline(raw: string): {
  currentSunPerUnit: number;
  history: Array<{ since: number; price: number }>;
} {
  const history = raw
    .split(",")
    .map((seg) => seg.split(":"))
    .filter((p) => p.length === 2)
    .map(([since, price]) => ({ since: Number(since), price: Number(price) }))
    .filter((p) => Number.isFinite(p.since) && Number.isFinite(p.price));
  return { currentSunPerUnit: history.at(-1)?.price ?? 0, history };
}

function blockNum(s: unknown): number | null {
  const m = /Num:(\d+)/.exec(String(s ?? ""));
  return m ? Number(m[1]) : null;
}

export class TronChainService {
  constructor(private readonly gateways: ChainGatewayProvider) {}

  async params(network: NetworkDescriptor, key?: string) {
    const params = await this.gateways.get(network, "tron").getChainParameters();
    if (key === undefined) return { params };
    const hit = params.find((p) => p.key === key);
    if (!hit) throw new UsageError("unknown_parameter", `unknown chain parameter: ${key}`);
    return { key: hit.key, value: hit.value };
  }

  async prices(network: NetworkDescriptor) {
    const gateway = this.gateways.get(network, "tron");
    const [energyRaw, bandwidthRaw, params] = await Promise.all([
      gateway.getEnergyPrices(),
      gateway.getBandwidthPrices(),
      gateway.getChainParameters(),
    ]);
    const memo = params.find((p) => p.key === "getMemoFee")?.value;
    return {
      energy: parsePriceTimeline(energyRaw),
      bandwidth: parsePriceTimeline(bandwidthRaw),
      memoFeeSun: String(memo ?? 0),
    };
  }

  async node(network: NetworkDescriptor) {
    const gateway = this.gateways.get(network, "tron");
    const [info, head] = await Promise.all([gateway.getNodeInfo(), gateway.getBlock()]);
    const header = ((head as Record<string, any>)?.block_header?.raw_data ?? {}) as {
      number?: number;
      timestamp?: number;
    };
    const headNumber = Number(header.number ?? 0);
    const headTimestamp = Number(header.timestamp ?? 0);
    const solidNumber = blockNum(info.solidityBlock);
    const codeVersion = info.configNodeInfo?.codeVersion;
    return {
      // Endpoint paths and queries may contain API keys.
      endpoint: endpointHost(network.httpEndpoint) || null,
      version: codeVersion ? `java-tron ${codeVersion}` : null,
      p2pVersion: info.configNodeInfo?.p2pVersion ?? null,
      headBlock: { number: headNumber, timestamp: headTimestamp },
      solidBlock: solidNumber === null ? null : { number: solidNumber },
      lagBlocks: solidNumber === null ? null : headNumber - solidNumber,
      inSync: headTimestamp > 0 && Date.now() - headTimestamp <= IN_SYNC_WINDOW_MS,
      peers:
        info.currentConnectCount === undefined
          ? null
          : {
              connected: Number(info.currentConnectCount),
              active: Number(info.activeConnectCount ?? 0),
            },
    };
  }
}
