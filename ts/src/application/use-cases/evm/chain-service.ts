import { endpointHost, type NetworkDescriptor } from "../../../domain/types/index.js";
import { evmFeeMode } from "../../../domain/fees/evm-gas.js";
import { decimalToSafeNumber, quantityToSafeNumber } from "../../../domain/numbers/index.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";

/** The protocol's fixed gas cost of a plain native transfer — the unit `chain prices` translates
 *  its per-gas numbers into a real spend with. */
const NATIVE_TRANSFER_GAS = 21_000;

/** hex QUANTITY → number, for the small values (block heights) this view reports. */
function quantity(value: unknown): number | null {
  try {
    return quantityToSafeNumber(value, "quantity", (message) => new Error(message));
  } catch {
    return null;
  }
}

function decimal(value: unknown): number | null {
  try {
    return decimalToSafeNumber(value, "quantity", (message) => new Error(message));
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
    const eip1559 = mode === "eip1559" && fee.baseFeeWei !== undefined;
    const priorityFeeWei = fee.suggestedPriorityWei ?? null;
    // On a 1559 chain the price a transfer actually pays is base + tip. `eth_gasPrice` is the
    // node's own single-number suggestion, which is not that sum — quoting it beside the two
    // components would print three numbers that do not add up (§9.3).
    const gasPriceWei =
      eip1559 && priorityFeeWei !== null
        ? (BigInt(fee.baseFeeWei!) + BigInt(priorityFeeWei)).toString(10)
        : fee.gasPriceWei;
    return {
      feeModel: mode,
      // A zero base fee is reported as "0" and not dropped: on BSC that IS the base fee, and the
      // difference between "zero" and "absent" is the difference between the two fee models.
      ...(eip1559 ? { baseFeeWei: fee.baseFeeWei, priorityFeeWei } : {}),
      gasPriceWei,
      // A unit price answers "how expensive is gas", not "what will this cost me". 21,000 is the
      // protocol's fixed cost of a plain transfer, so the translation is exact rather than an
      // estimate — the same intent as TRON's `Memo fee` row.
      transferGas: NATIVE_TRANSFER_GAS,
      transferCostWei: (BigInt(gasPriceWei) * BigInt(NATIVE_TRANSFER_GAS)).toString(10),
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
    const [version, syncing, peers, head, finalized, chainId] = await Promise.all([
      optional(() => gateway.clientVersion()),
      optional(() => gateway.syncing()),
      optional(() => gateway.peerCount()),
      gateway.getBlock(),
      optional(() => gateway.getBlock("finalized")),
      // Asked of the NODE, not read off the descriptor: the question this command answers is
      // "is this endpoint the chain I think it is", and our own configuration cannot answer that.
      optional(() => gateway.chainId()),
    ]);

    const headBlock = head as Record<string, unknown> | null;
    const headNumber = quantity(headBlock?.number) ?? 0;
    const solidNumber = quantity((finalized as Record<string, unknown> | null)?.number);
    const headTimestamp = quantity(headBlock?.timestamp);
    const peerCount = peers === null ? null : decimal(peers);

    return {
      // HOST only — same reason as the TRON side: an endpoint may carry an API key in its path,
      // and `chain node` is a diagnostic people paste around. Full URLs come from
      // `config networks.<id>.httpEndpoint`, which is a named read rather than a listing.
      endpoint: endpointHost(network.httpEndpoint) || null,
      version,
      // EIP-155's chain id, as the node reports it. It is what every signature commits to, so it
      // is worth stating where an endpoint can be checked against the chain it claims to serve.
      chainId,
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
      peers: peerCount === null ? null : { connected: peerCount, active: peerCount },
    };
  }
}
