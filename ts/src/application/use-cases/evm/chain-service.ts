import { endpointHost, type NetworkDescriptor } from "../../../domain/types/index.js";
import { evmFeeMode } from "../../../domain/fees/evm-gas.js";
import { decimalToSafeNumber } from "../../../domain/numbers/index.js";
import { ChainError } from "../../../domain/errors/index.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";

const NATIVE_TRANSFER_GAS = 21_000;

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

    if (head === null) {
      throw new ChainError(
        "invalid_node_response",
        `the node reported no latest block on ${network.id}`,
      );
    }
    const solidNumber = finalized?.number ?? null;
    const peerCount = peers === null ? null : decimal(peers);

    return {
      // Endpoint paths may contain credentials; diagnostics expose only the host.
      endpoint: endpointHost(network.httpEndpoint) || null,
      version,
      chainId,
      p2pVersion: null,
      headBlock: {
        number: head.number,
        // RPC seconds become milliseconds in this view.
        timestamp: head.timestamp * 1000,
      },
      solidBlock: solidNumber === null ? null : { number: solidNumber },
      lagBlocks: solidNumber === null ? null : head.number - solidNumber,
      // False means caught up; null means unknown.
      inSync: syncing === null ? null : !syncing,
      peers: peerCount === null ? null : { connected: peerCount, active: peerCount },
    };
  }
}
