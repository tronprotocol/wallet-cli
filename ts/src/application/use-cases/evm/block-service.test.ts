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
  it("returns the node's block object verbatim", async () => {
    const RPC_BLOCK = { number: "0x1", hash: "0xaabb" };
    const out = await service(async () => RPC_BLOCK).get(net, "1");
    expect(out).toEqual({ block: RPC_BLOCK });
  });

  it("throws not_found (exit 1) when a specific height has no block", async () => {
    await expect(service(async () => null).get(net, "999999999")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("throws invalid_node_response when the latest block comes back null", async () => {
    // Asking for "latest" with no height and getting null back is not a fact about the chain —
    // there is no such thing as "the chain has no latest block" — so it must not be reported the
    // same way as a specific missing height.
    await expect(service(async () => null).get(net)).rejects.toMatchObject({
      code: "invalid_node_response",
    });
  });
});
