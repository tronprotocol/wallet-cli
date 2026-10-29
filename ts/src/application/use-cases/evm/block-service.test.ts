import { describe, it, expect } from "vitest";
import { EvmBlockService } from "./block-service.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

const net = {
  id: "eip155:11155111",
  family: "evm",
  nativeSymbol: "ETH",
  chainId: "11155111",
  httpEndpoint: "https://node.example",
  capabilities: [],
} as NetworkDescriptor;

function service(getBlock: (number?: string) => Promise<unknown>) {
  const gateway = { getBlock };
  return new EvmBlockService({ get: () => gateway } as unknown as ChainGatewayProvider);
}

describe("EvmBlockService.get", () => {
  it("returns the node's block verbatim beside its normalized fields", async () => {
    const RPC_BLOCK = { number: "0x1", hash: "0xaabb", timestamp: "0x66b1c0d0" };
    const view = {
      number: 1,
      timestamp: 1722925264,
      hash: "0xaabb",
      transactionCount: 2,
      gasUsed: "21000",
      gasLimit: "30000000",
      baseFeeWei: "7",
      raw: RPC_BLOCK,
    };
    const out = await service(async () => view).get(net, "1");
    expect(out).toEqual({
      block: RPC_BLOCK,
      number: 1,
      timestamp: 1722925264000,
      hash: "0xaabb",
      transactionCount: 2,
      gasUsed: "21000",
      gasLimit: "30000000",
      baseFeeWei: "7",
    });
  });

  it("omits normalized fields the block does not carry", async () => {
    const out = await service(async () => ({ number: 1, timestamp: 2, raw: {} })).get(net, "1");
    expect(out).toEqual({ block: {}, number: 1, timestamp: 2000 });
  });

  it("throws not_found (exit 1) when a specific height has no block", async () => {
    await expect(service(async () => null).get(net, "999999999")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("throws invalid_node_response when the latest block comes back null", async () => {
    await expect(service(async () => null).get(net)).rejects.toMatchObject({
      code: "invalid_node_response",
    });
  });
});
