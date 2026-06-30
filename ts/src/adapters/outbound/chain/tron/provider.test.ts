import { describe, it, expect } from "vitest";
import { ChainGatewayRegistry } from "./provider.js";
import { TronRpcClient } from "./tron.js";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";

const net = (family: "tron"): NetworkDescriptor =>
  ({ id: `${family}-net`, family, httpEndpoint: "http://x", aliases: [], chainId: "1", capabilities: [] } as any);

describe("ChainGatewayRegistry injected factories", () => {
  const p = new ChainGatewayRegistry({
    tron: (n) => new TronRpcClient(n.httpEndpoint ?? ""),
  });
  it("dispatches the tron factory and caches by net id", () => {
    expect(p.get(net("tron"), "tron")).toBeInstanceOf(TronRpcClient);
    expect(p.client(net("tron"))).toBe(p.client(net("tron"))); // cached
  });
});
