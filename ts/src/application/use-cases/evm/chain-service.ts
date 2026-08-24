import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { evmFeeMode } from "../../../domain/fees/evm-gas.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";

/** hex QUANTITY → number, for the small values (block heights) this view reports. */
function quantity(value: unknown): number | null {
  if (typeof value !== "string" || value === "") return null;
  try {
    return Number(BigInt(value));
  } catch {
    return null;
  }
}

/** run an optional read, degrading to null instead of failing the whole command. */
async function optional<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

export class EvmChainService {
  constructor(private readonly gateways: ChainGatewayProvider) {}

  /**
   * Gas pricing. Family-shaped, like `account info`: TRON reports energy and bandwidth unit
   * prices, and an EVM chain has neither — there is no common field to align, so the two report
   * different sets rather than a lowest common denominator that describes neither.
   */
  async prices(network: NetworkDescriptor) {
    const fee = await this.gateways.get(network, "evm").feeData();
    const mode = evmFeeMode(fee.baseFeeWei, network.feeModel);
    return {
      feeModel: mode,
      // A zero base fee is reported as "0" and not dropped: on BSC that IS the base fee, and the
      // difference between "zero" and "absent" is the difference between the two fee models.
      ...(mode === "eip1559" && fee.baseFeeWei !== undefined
        ? { baseFeeWei: fee.baseFeeWei, priorityFeeWei: fee.suggestedPriorityWei ?? null }
        : {}),
      gasPriceWei: fee.gasPriceWei,
    };
  }

  /**
   * Node status. A computed view, not a passthrough — the question being answered is "is this
   * node behind?", which no single RPC call reports.
   *
   * `finalized` stands in for TRON's solid block: both name the last irreversible block. Neither
   * it nor `net_peerCount` is universally served — plenty of hosted endpoints refuse the latter
   * outright — so both degrade to null rather than taking the command down with them.
   */
  async node(network: NetworkDescriptor) {
    const gateway = this.gateways.get(network, "evm");
    const [version, syncing, peers, head, finalized] = await Promise.all([
      optional(() => gateway.clientVersion()),
      optional(() => gateway.syncing()),
      optional(() => gateway.peerCount()),
      gateway.getBlock(),
      optional(() => gateway.getBlock("finalized")),
    ]);

    const headBlock = head as Record<string, unknown> | null;
    const headNumber = quantity(headBlock?.number) ?? 0;
    const solidNumber = quantity((finalized as Record<string, unknown> | null)?.number);
    const headTimestamp = quantity(headBlock?.timestamp);

    return {
      endpoint: network.httpEndpoint ?? null,
      version,
      // EVM nodes expose no p2p protocol version over JSON-RPC; TRON's getnodeinfo does.
      p2pVersion: null,
      headBlock: {
        number: headNumber,
        // seconds on the wire, milliseconds in this view — as TRON already reports.
        timestamp: headTimestamp === null ? 0 : headTimestamp * 1000,
      },
      solidBlock: solidNumber === null ? null : { number: solidNumber },
      lagBlocks: solidNumber === null ? null : headNumber - solidNumber,
      // `eth_syncing` answers this directly: false means caught up. Unreachable → unknown, which
      // is not the same as "out of sync".
      inSync: syncing === null ? null : syncing === false,
      peers: peers === null ? null : { connected: Number(peers), active: Number(peers) },
    };
  }
}
