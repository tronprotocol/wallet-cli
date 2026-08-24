/**
 * EvmChainService — `chain node`, the EVM counterpart of TRON's node status.
 *
 * Unlike `block` this is a computed view, not a passthrough: TRON's version already derives lag
 * and sync state, and the same questions ("is this node behind?") need answering on EVM.
 *
 * Two mappings carry the design:
 *   - solid block → the `finalized` tag. Both mean "irreversible"; TRON calls it solid, EVM has
 *     called it finalized since the merge.
 *   - inSync → `eth_syncing`, which answers directly instead of TRON's head-timestamp heuristic.
 *
 * Hosted endpoints routinely refuse `net_peerCount`, and not every chain serves `finalized`.
 * Neither may take the whole command down — they degrade to null, as §10 already specifies for
 * fields an endpoint does not expose.
 */
import { describe, it, expect } from "vitest";
import { EvmChainService } from "./chain-service.js";
import { ChainError } from "../../../domain/errors/index.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

const net = {
  id: "evm:1",
  family: "evm",
  nativeSymbol: "ETH",
  chainId: "1",
  httpEndpoint: "https://node.example",
  capabilities: [],
} as NetworkDescriptor;

const HEAD = { number: "0x12d687", timestamp: "0x66b1c0d0" };
const FINALIZED = { number: "0x12d600" };

function service(over: Partial<Record<string, unknown>> = {}) {
  const gateway = {
    clientVersion: async () => over.clientVersion ?? "Geth/v1.14.0",
    syncing: async () => (over.syncing === undefined ? false : over.syncing),
    peerCount: async () => {
      if (over.peerCount instanceof Error) throw over.peerCount;
      return over.peerCount ?? "25";
    },
    getBlock: async (tag?: string) => {
      if (tag === "finalized") {
        if (over.finalized instanceof Error) throw over.finalized;
        return over.finalized === undefined ? FINALIZED : over.finalized;
      }
      return over.head === undefined ? HEAD : over.head;
    },
  };
  return new EvmChainService({ get: () => gateway } as unknown as ChainGatewayProvider);
}

describe("EvmChainService.node", () => {
  it("reports endpoint, version, head and peers", async () => {
    const out = await service().node(net);

    expect(out).toMatchObject({
      endpoint: "https://node.example",
      version: "Geth/v1.14.0",
      headBlock: { number: 1234567 },
      peers: { connected: 25 },
    });
  });

  it("maps the finalized block to the solid block and derives the lag", async () => {
    const out = await service().node(net);

    expect(out.solidBlock).toEqual({ number: 1234432 });
    expect(out.lagBlocks).toBe(1234567 - 1234432);
  });

  it("reads sync state from eth_syncing rather than a timestamp heuristic", async () => {
    expect((await service({ syncing: false }).node(net)).inSync).toBe(true);
    expect((await service({ syncing: { currentBlock: "0x1" } }).node(net)).inSync).toBe(false);
  });

  it("degrades peers to null when the endpoint refuses net_peerCount", async () => {
    const out = await service({
      peerCount: new ChainError("rpc_error", "method not supported"),
    }).node(net);

    expect(out.peers).toBeNull();
  });

  it("degrades the solid block to null on a chain that does not serve finalized", async () => {
    const out = await service({ finalized: new ChainError("rpc_error", "unknown block") }).node(net);

    expect(out.solidBlock).toBeNull();
    expect(out.lagBlocks).toBeNull();
  });

  it("still reports the head when the optional calls all fail", async () => {
    const out = await service({
      peerCount: new ChainError("rpc_error", "no"),
      finalized: new ChainError("rpc_error", "no"),
    }).node(net);

    expect(out.headBlock.number).toBe(1234567);
  });
});

/**
 * `chain prices` is family-shaped in the same way `account info` is: TRON reports energy and
 * bandwidth unit prices, an EVM chain reports gas pricing. There is no shared field to align.
 */
describe("EvmChainService.prices", () => {
  function priced(fee: Record<string, unknown>, declared?: string) {
    const gateway = { feeData: async () => fee };
    const svc = new EvmChainService({ get: () => gateway } as unknown as ChainGatewayProvider);
    return svc.prices({ ...net, ...(declared ? { feeModel: declared } : {}) } as NetworkDescriptor);
  }

  it("reports the 1559 fee fields on a chain with a base fee", async () => {
    await expect(
      priced({ baseFeeWei: "155315168", gasPriceWei: "155353216", suggestedPriorityWei: "100000" }),
    ).resolves.toEqual({
      feeModel: "eip1559",
      baseFeeWei: "155315168",
      priorityFeeWei: "100000",
      gasPriceWei: "155353216",
    });
  });

  // BSC: base fee zero is still EIP-1559, and the reported model must say so.
  it("calls a zero base fee EIP-1559, not legacy", async () => {
    await expect(
      priced({ baseFeeWei: "0", gasPriceWei: "50000000", suggestedPriorityWei: "50000000" }),
    ).resolves.toMatchObject({ feeModel: "eip1559", baseFeeWei: "0" });
  });

  it("reports legacy pricing when the chain carries no base fee", async () => {
    const out = await priced({ gasPriceWei: "3000000000" });

    expect(out).toMatchObject({ feeModel: "legacy", gasPriceWei: "3000000000" });
    expect(out.baseFeeWei).toBeUndefined();
  });

  it("honours a network that pins itself to legacy", async () => {
    await expect(priced({ baseFeeWei: "100", gasPriceWei: "110" }, "legacy")).resolves.toMatchObject(
      { feeModel: "legacy" },
    );
  });
});
