import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { UsageError } from "../../../domain/errors/index.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";

/** TRON blocks every ~3s; a head older than 3 intervals means the node lags the chain. */
const IN_SYNC_WINDOW_MS = 9_000;

/** "ts:price,ts:price,…" (node price timeline) → structured history; current = last segment. */
function parsePriceTimeline(raw: string): { currentSunPerUnit: number; history: Array<{ since: number; price: number }> } {
  const history = raw
    .split(",")
    .map((seg) => seg.split(":"))
    .filter((p) => p.length === 2)
    .map(([since, price]) => ({ since: Number(since), price: Number(price) }))
    // Drop malformed segments so a bad node fragment can't leak NaN into the output; `?? 0`
    // only guards `undefined`, not NaN.
    .filter((p) => Number.isFinite(p.since) && Number.isFinite(p.price));
  return { currentSunPerUnit: history.at(-1)?.price ?? 0, history };
}

/** getnodeinfo "Num:84120345,ID:…" → 84120345 (null if unparsable). */
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
    if (!hit) throw new UsageError("not_found", `unknown chain parameter: ${key}`);
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
    const header = ((head as Record<string, any>)?.block_header?.raw_data ?? {}) as { number?: number; timestamp?: number };
    const headNumber = Number(header.number ?? 0);
    const headTimestamp = Number(header.timestamp ?? 0);
    const solidNumber = blockNum(info.solidityBlock);
    const codeVersion = info.configNodeInfo?.codeVersion;
    return {
      endpoint: network.httpEndpoint ?? null,
      version: codeVersion ? `java-tron ${codeVersion}` : null,
      p2pVersion: info.configNodeInfo?.p2pVersion ?? null,
      headBlock: { number: headNumber, timestamp: headTimestamp },
      solidBlock: solidNumber === null ? null : { number: solidNumber },
      lagBlocks: solidNumber === null ? null : headNumber - solidNumber,
      inSync: headTimestamp > 0 && Date.now() - headTimestamp <= IN_SYNC_WINDOW_MS,
      peers: info.currentConnectCount === undefined
        ? null
        : { connected: Number(info.currentConnectCount), active: Number(info.activeConnectCount ?? 0) },
    };
  }
}
