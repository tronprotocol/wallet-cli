import { endpointHost, type NetworkDescriptor } from "../../../domain/types/index.js";
import { evmFeeMode } from "../../../domain/fees/evm-gas.js";
import { decimalToSafeNumber, quantityToSafeNumber } from "../../../domain/numbers/index.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";

const NATIVE_TRANSFER_GAS = 21_000;

// Parses a hex RPC quantity; invalid or unsafe values become null.
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

async function optional<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

export class EvmChainService {
  constructor(private readonly gateways: ChainGatewayProvider) {}

  async prices(network: NetworkDescriptor) {
    const fee = await this.gateways.get(network, "evm").feeData();
    const mode = evmFeeMode(fee.baseFeeWei, network.feeModel);
    const eip1559 = mode === "eip1559" && fee.baseFeeWei !== undefined;
    const priorityFeeWei = fee.suggestedPriorityWei ?? null;
    // Quote base plus suggested tip when available, rather than the separate gas-price suggestion.
    const gasPriceWei =
      eip1559 && priorityFeeWei !== null
        ? (BigInt(fee.baseFeeWei!) + BigInt(priorityFeeWei)).toString(10)
        : fee.gasPriceWei;
    return {
      feeModel: mode,
      // Zero base fee still identifies EIP-1559; preserve it.
      ...(eip1559 ? { baseFeeWei: fee.baseFeeWei, priorityFeeWei } : {}),
      gasPriceWei,
      transferGas: NATIVE_TRANSFER_GAS,
      transferCostWei: (BigInt(gasPriceWei) * BigInt(NATIVE_TRANSFER_GAS)).toString(10),
    };
  }

  // Optional node methods may be unsupported; retain the head when those reads fail.
  async node(network: NetworkDescriptor) {
    const gateway = this.gateways.get(network, "evm");
    const [version, syncing, peers, head, finalized, chainId] = await Promise.all([
      optional(() => gateway.clientVersion()),
      optional(() => gateway.syncing()),
      optional(() => gateway.peerCount()),
      gateway.getBlock(),
      optional(() => gateway.getBlock("finalized")),
      // Query the node’s chain ID so callers can compare it with configuration.
      optional(() => gateway.chainId()),
    ]);

    const headBlock = head as Record<string, unknown> | null;
    const headNumber = quantity(headBlock?.number) ?? 0;
    const solidNumber = quantity((finalized as Record<string, unknown> | null)?.number);
    const headTimestamp = quantity(headBlock?.timestamp);
    const peerCount = peers === null ? null : decimal(peers);

    return {
      // Endpoint paths may contain credentials; diagnostics expose only the host.
      endpoint: endpointHost(network.httpEndpoint) || null,
      version,
      chainId,
      p2pVersion: null,
      headBlock: {
        number: headNumber,
        // RPC seconds become milliseconds in this view.
        timestamp: headTimestamp === null ? 0 : headTimestamp * 1000,
      },
      solidBlock: solidNumber === null ? null : { number: solidNumber },
      lagBlocks: solidNumber === null ? null : headNumber - solidNumber,
      // False means caught up; null means unknown.
      inSync: syncing === null ? null : syncing === false,
      peers: peerCount === null ? null : { connected: peerCount, active: peerCount },
    };
  }
}
