import { CommandDeadline } from "../../services/command-deadline.js";
import { describe, it, expect } from "vitest";
import { TronChainService } from "./chain-service.js";
import type { WallClock } from "../../contracts/wall-clock.js";
import { ChainError } from "../../../domain/errors/index.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

const NO_DEADLINE = new CommandDeadline(0);

const net = {
  id: "tron:3448148188",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "nile",
  aliases: [],
  capabilities: [],
  httpEndpoint: "https://nile.trongrid.io",
} as NetworkDescriptor;

function svc(gateway: Record<string, unknown>, clock?: WallClock) {
  return new TronChainService({ get: () => gateway } as unknown as ChainGatewayProvider, clock);
}

describe("TronChainService.params", () => {
  const gateway = {
    getChainParameters: async () => [
      { key: "getEnergyFee", value: 210 },
      { key: "getMemoFee", value: 1000000 },
    ],
  };
  it("lists all parameters with the catalog unit", async () => {
    expect(await svc(gateway).params(NO_DEADLINE, net)).toEqual({
      params: [
        { key: "getEnergyFee", value: 210, unit: "sun" },
        { key: "getMemoFee", value: 1000000, unit: "sun" },
      ],
    });
  });
  it("gives a parameter without a catalog unit an empty unit", async () => {
    const flags = { getChainParameters: async () => [{ key: "getAllowMultiSign", value: 1 }] };
    expect(await svc(flags).params(NO_DEADLINE, net)).toEqual({
      params: [{ key: "getAllowMultiSign", value: 1, unit: "" }],
    });
  });
  it("returns a single key, and unknown_parameter for unknown keys", async () => {
    expect(await svc(gateway).params(NO_DEADLINE, net, "getEnergyFee")).toEqual({
      key: "getEnergyFee",
      value: 210,
      unit: "sun",
    });
    await expect(svc(gateway).params(NO_DEADLINE, net, "getNope")).rejects.toMatchObject({
      code: "unknown_parameter",
    });
  });
});

const points = (...pairs: Array<[number, number]>) =>
  pairs.map(([sinceMs, sunPerUnit]) => ({ sinceMs, sunPerUnit }));

describe("TronChainService.prices", () => {
  it("reports the last point as current and keeps the timeline; memo fee from params", async () => {
    const gateway = {
      getEnergyPrices: async () => points([0, 100], [1670515200000, 210]),
      getBandwidthPrices: async () => points([0, 10], [1614456000000, 1000]),
      getChainParameters: async () => [{ key: "getMemoFee", value: 1000000 }],
    };
    expect(await svc(gateway).prices(NO_DEADLINE, net)).toEqual({
      energy: {
        currentSunPerUnit: 210,
        history: [
          { since: 0, price: 100 },
          { since: 1670515200000, price: 210 },
        ],
      },
      bandwidth: {
        currentSunPerUnit: 1000,
        history: [
          { since: 0, price: 10 },
          { since: 1614456000000, price: 1000 },
        ],
      },
      memoFeeSun: "1000000",
    });
  });

  it("fails instead of reporting a price when the node's timeline is unusable", async () => {
    const gateway = {
      getEnergyPrices: async () => {
        throw new ChainError("invalid_node_response", "malformed energy price timeline");
      },
      getBandwidthPrices: async () => points([0, 10]),
      getChainParameters: async () => [],
    };
    await expect(svc(gateway).prices(NO_DEADLINE, net)).rejects.toMatchObject({
      code: "invalid_node_response",
    });
  });
});

describe("TronChainService.node", () => {
  it("derives head/solid/lag/inSync from the normalized node facts", async () => {
    const now = Date.now();
    const gateway = {
      getNodeInfo: async () => ({
        solidBlockNumber: 84120326,
        peers: { connected: 30, active: 27 },
        codeVersion: "4.7.7",
        p2pVersion: "11111",
      }),
      getHeadBlock: async () => ({ number: 84120345, timestampMs: now - 2000 }),
    };
    const view = await svc(gateway).node(NO_DEADLINE, net);
    expect(view).toMatchObject({
      endpoint: "nile.trongrid.io",
      version: "java-tron 4.7.7",
      p2pVersion: "11111",
      headBlock: { number: 84120345, timestamp: now - 2000 },
      solidBlock: { number: 84120326 },
      lagBlocks: 19,
      inSync: true,
      peers: { connected: 30, active: 27 },
    });
  });
  it("never echoes an endpoint's path or query, which is where API keys live", async () => {
    const gateway = {
      getNodeInfo: async () => ({}),
      getHeadBlock: async () => ({ number: 1, timestampMs: Date.now() }),
    };
    const withKey = { ...net, httpEndpoint: "https://tron.example/wallet?apikey=SECRET-KEY" };
    const view = await svc(gateway).node(NO_DEADLINE, withKey as typeof net);

    expect(view.endpoint).toBe("tron.example");
    expect(JSON.stringify(view)).not.toContain("SECRET");
  });

  it("nulls unexposed fields (public gateway)", async () => {
    const gateway = {
      getNodeInfo: async () => ({}),
      getHeadBlock: async () => ({ number: 100, timestampMs: Date.now() - 60_000 }),
    };
    const view = await svc(gateway).node(NO_DEADLINE, net);
    expect(view.version).toBeNull();
    expect(view.solidBlock).toBeNull();
    expect(view.lagBlocks).toBeNull();
    expect(view.peers).toBeNull();
    expect(view.inSync).toBe(false);
  });

  it("counts a head block exactly 9 s behind the clock as in sync, and 1 ms older as not", async () => {
    const now = 1_800_000_000_000;
    const at = (timestampMs: number) => ({
      getNodeInfo: async () => ({}),
      getHeadBlock: async () => ({ number: 100, timestampMs }),
    });
    expect((await svc(at(now - 9_000), () => now).node(NO_DEADLINE, net)).inSync).toBe(true);
    expect((await svc(at(now - 9_001), () => now).node(NO_DEADLINE, net)).inSync).toBe(false);
  });

  it("fails instead of reporting head block 0 when the node returns no head", async () => {
    const gateway = {
      getNodeInfo: async () => ({}),
      getHeadBlock: async () => {
        throw new ChainError("invalid_node_response", "the node reported no latest block");
      },
    };
    await expect(svc(gateway).node(NO_DEADLINE, net)).rejects.toMatchObject({
      code: "invalid_node_response",
    });
  });
});

describe("TronChainService.prices with a negative memo fee", () => {
  it("refuses to report a negative memo fee", async () => {
    const gateway = {
      getEnergyPrices: async () => points([0, 100]),
      getBandwidthPrices: async () => points([0, 1000]),
      getChainParameters: async () => [{ key: "getMemoFee", value: -1 }],
    };
    await expect(svc(gateway).prices(NO_DEADLINE, net)).rejects.toMatchObject({
      code: "provider_error",
    });
  });
});
