import { describe, it, expect } from "vitest";
import { TronBlockService } from "./block-service.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

const net = {
  id: "tron:0x2b6653dc",
  family: "tron",
  nativeSymbol: "TRX",
  httpEndpoint: "https://node.example",
  capabilities: [],
} as unknown as NetworkDescriptor;

function service(getBlock: (number?: string) => Promise<unknown>) {
  const gateway = { getBlock };
  return new TronBlockService({ get: () => gateway } as unknown as ChainGatewayProvider);
}

describe("TronBlockService.get", () => {
  it("returns the node's block verbatim beside the normalized summary", async () => {
    const RAW = { blockID: "abc", block_header: {}, transactions: [] };
    const out = await service(async () => ({
      number: 1,
      timestampMs: 1722925264000,
      transactionCount: 2,
      raw: RAW,
    })).get(net, "1");
    expect(out).toEqual({
      block: RAW,
      number: 1,
      timestampMs: 1722925264000,
      transactionCount: 2,
    });
  });

  it("throws not_found (exit 1) when a specific height has no block", async () => {
    await expect(service(async () => null).get(net, "999999999")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("throws invalid_node_response when the node holds no latest block", async () => {
    await expect(service(async () => null).get(net)).rejects.toMatchObject({
      code: "invalid_node_response",
    });
  });
});
