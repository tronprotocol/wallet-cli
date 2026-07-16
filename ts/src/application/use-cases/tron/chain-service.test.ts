import { describe, it, expect } from "vitest";
import { TronChainService } from "./chain-service.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

const net = {
  id: "tron:nile", family: "tron", chainId: "nile", aliases: [], capabilities: [],
  httpEndpoint: "https://nile.trongrid.io",
} as NetworkDescriptor;

function svc(gateway: Record<string, unknown>) {
  return new TronChainService({ get: () => gateway } as unknown as ChainGatewayProvider);
}

describe("TronChainService.params", () => {
  const gateway = { getChainParameters: async () => [{ key: "getEnergyFee", value: 210 }, { key: "getMemoFee", value: 1000000 }] };
  it("lists all parameters", async () => {
    expect(await svc(gateway).params(net)).toEqual({ params: [{ key: "getEnergyFee", value: 210 }, { key: "getMemoFee", value: 1000000 }] });
  });
  it("returns a single key, and not_found for unknown keys", async () => {
    expect(await svc(gateway).params(net, "getEnergyFee")).toEqual({ key: "getEnergyFee", value: 210 });
    await expect(svc(gateway).params(net, "getNope")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("TronChainService.prices", () => {
  it("parses price history strings; current = last segment; memo fee from params", async () => {
    const gateway = {
      getEnergyPrices: async () => "0:100,1670515200000:210",
      getBandwidthPrices: async () => "0:10,1614456000000:1000",
      getChainParameters: async () => [{ key: "getMemoFee", value: 1000000 }],
    };
    expect(await svc(gateway).prices(net)).toEqual({
      energy: { currentSunPerUnit: 210, history: [{ since: 0, price: 100 }, { since: 1670515200000, price: 210 }] },
      bandwidth: { currentSunPerUnit: 1000, history: [{ since: 0, price: 10 }, { since: 1614456000000, price: 1000 }] },
      memoFeeSun: "1000000",
    });
  });

  it("drops malformed segments so NaN never reaches the output", async () => {
    const gateway = {
      // energy: middle segment is non-numeric; bandwidth: entirely malformed; both must exclude NaN.
      getEnergyPrices: async () => "0:100,1670515200000:oops,1670515300000:230",
      getBandwidthPrices: async () => "abc:def,x:y",
      getChainParameters: async () => [{ key: "getMemoFee", value: 1000000 }],
    };
    const view = await svc(gateway).prices(net);
    expect(view.energy).toEqual({
      currentSunPerUnit: 230,
      history: [{ since: 0, price: 100 }, { since: 1670515300000, price: 230 }],
    });
    // all-invalid → empty history, current falls back to 0 (no NaN)
    expect(view.bandwidth).toEqual({ currentSunPerUnit: 0, history: [] });
    expect(Number.isNaN(view.energy.currentSunPerUnit)).toBe(false);
    expect(view.energy.history.every((h) => Number.isFinite(h.since) && Number.isFinite(h.price))).toBe(true);
  });

  it("handles an empty price string without producing NaN", async () => {
    const gateway = {
      getEnergyPrices: async () => "",
      getBandwidthPrices: async () => "",
      getChainParameters: async () => [],
    };
    const view = await svc(gateway).prices(net);
    expect(view.energy).toEqual({ currentSunPerUnit: 0, history: [] });
    expect(view.bandwidth).toEqual({ currentSunPerUnit: 0, history: [] });
  });
});

describe("TronChainService.node", () => {
  it("derives head/solid/lag/inSync; missing best-effort fields become null", async () => {
    const now = Date.now();
    const gateway = {
      getNodeInfo: async () => ({
        block: "Num:84120345,ID:abc", solidityBlock: "Num:84120326,ID:def",
        currentConnectCount: 30, activeConnectCount: 27,
        configNodeInfo: { codeVersion: "4.7.7", p2pVersion: "11111" },
      }),
      getBlock: async () => ({ block_header: { raw_data: { number: 84120345, timestamp: now - 2000 } } }),
    };
    const view = await svc(gateway).node(net);
    expect(view).toMatchObject({
      endpoint: "https://nile.trongrid.io",
      version: "java-tron 4.7.7",
      p2pVersion: "11111",
      headBlock: { number: 84120345, timestamp: now - 2000 },
      solidBlock: { number: 84120326 },
      lagBlocks: 19,
      inSync: true,
      peers: { connected: 30, active: 27 },
    });
  });
  it("nulls unexposed fields (public gateway)", async () => {
    const gateway = {
      getNodeInfo: async () => ({}),
      getBlock: async () => ({ block_header: { raw_data: { number: 100, timestamp: Date.now() - 60_000 } } }),
    };
    const view = await svc(gateway).node(net);
    expect(view.version).toBeNull();
    expect(view.peers).toBeNull();
    expect(view.inSync).toBe(false);
  });
});
