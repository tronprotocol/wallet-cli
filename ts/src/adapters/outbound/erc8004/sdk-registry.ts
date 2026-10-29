import { SDK } from "@bankofai/8004-sdk";
import { Interface, type InterfaceAbi } from "ethers";
import type { AgentContractPorts } from "../../../application/ports/agent-registry.js";
import type {
  AgentRegistryReader,
  AgentRegistryValue,
} from "../../../application/ports/agent-sdk.js";
import type { ChainGatewayProvider } from "../../../application/ports/chain/gateway-provider.js";
import { UsageError, ExecutionError } from "../../../domain/errors/index.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { sameAddress } from "../../../domain/family/index.js";

interface SdkNetwork {
  sdk: SDK;
  identity: Interface;
}

const UNUSED_RPC_URL = "https://unused.invalid";

// The SDK names TRON networks by name and EVM networks by CAIP-2 id.
const TRON_SDK_NETWORKS: Readonly<Record<string, string>> = {
  "728126428": "tron:mainnet",
  "3448148188": "tron:nile",
  "2494104990": "tron:shasta",
};

export class SdkAgentRegistry implements AgentRegistryReader {
  readonly #networks = new Map<string, SdkNetwork>();

  constructor(
    private readonly contracts: AgentContractPorts,
    private readonly gateways: ChainGatewayProvider,
  ) {}

  registry(network: NetworkDescriptor): string {
    return this.#for(network).sdk.identityRegistry;
  }

  async read(
    network: NetworkDescriptor,
    method: string,
    params: Array<{ type: string; value: unknown }>,
  ): Promise<AgentRegistryValue> {
    const configured = this.#for(network);
    let decoded;
    try {
      const response = await this.contracts[network.family].call(
        network,
        configured.sdk.identityRegistry,
        method,
        params,
      );
      const raw = network.family === "tron" ? response.result[0] : response.result;
      const data = String(raw ?? "");
      decoded = configured.identity.decodeFunctionResult(
        method,
        data.startsWith("0x") ? data : `0x${data}`,
      );
    } catch (error) {
      const data = error as {
        message?: string;
        details?: { nodeMessage?: string; revertData?: string };
        value?: string;
        data?: string;
      };
      const reason = `${data?.message ?? ""} ${data?.details?.nodeMessage ?? ""}`;
      let nonexistent = false;
      const revert = data?.details?.revertData ?? data?.data ?? data?.value;
      if (typeof revert === "string") {
        try {
          nonexistent =
            new Interface([
              "error ERC721NonexistentToken(uint256 tokenId)",
              "error Error(string)",
            ]).parseError(revert)?.name === "ERC721NonexistentToken";
        } catch {
          // Preserve the original failure when revert decoding fails.
        }
      }
      if (
        ["ownerOf(uint256)", "tokenURI(uint256)", "getApproved(uint256)"].includes(method) &&
        (nonexistent ||
          /ERC721NonexistentToken|ERC721: (?:invalid token ID|owner query for nonexistent token|URI query for nonexistent token|approved query for nonexistent token)/i.test(
            reason,
          ))
      ) {
        throw new ExecutionError("agent_not_found", "the requested agent does not exist");
      }
      throw error;
    }
    const value = decoded[0];
    const output = configured.identity.getFunction(method)?.outputs[0];
    return output?.baseType === "address"
      ? configured.sdk.chain.toChainAddress(String(value))
      : (value as AgentRegistryValue);
  }

  async registeredAgentId(network: NetworkDescriptor, txId: string): Promise<string | undefined> {
    const configured = this.#for(network);
    if (network.family === "evm") {
      const receipt = await this.gateways.get(network, "evm").getTransactionReceipt(txId);
      if (!receipt) return undefined;
      const logs = matchingLogs(record(receipt.raw)?.logs, configured.sdk);
      return configured.sdk.chain.parseRegisteredAgentId({ logs });
    }

    const receipt = await this.gateways.get(network, "tron").getTransactionInfoById(txId);
    const logs = matchingLogs(receipt.log, configured.sdk);
    return configured.sdk.chain.parseRegisteredAgentId({ log: logs });
  }

  #for(network: NetworkDescriptor): SdkNetwork {
    const existing = this.#networks.get(network.id);
    if (existing) return existing;
    const sdk = sdkFor(network);
    const configured = {
      sdk,
      identity: new Interface(sdk.identityRegistryAbi as unknown as InterfaceAbi),
    };
    this.#networks.set(network.id, configured);
    return configured;
  }
}

// Support is decided before this call; the SDK refuses a network it has no deployment for.
function sdkFor(network: NetworkDescriptor): SDK {
  const [namespace, reference] = network.id.split(":");
  if (
    namespace !== (network.family === "tron" ? "tron" : "eip155") ||
    reference !== network.chainId
  ) {
    throw new UsageError(
      "family_mismatch",
      `network descriptor ${network.id} does not match family ${network.family} and chain id ${network.chainId}`,
    );
  }
  const name = network.family === "tron" ? TRON_SDK_NETWORKS[network.chainId] : network.id;
  try {
    if (name === undefined) throw new Error(`no ERC-8004 SDK network for ${network.id}`);
    return new SDK({ network: name, chainId: Number(network.chainId), rpcUrl: UNUSED_RPC_URL });
  } catch (error) {
    throw new UsageError("unsupported_network", (error as Error).message);
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function matchingLogs(value: unknown, sdk: SDK): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, unknown> => {
    const log = record(entry);
    if (!log || typeof log.address !== "string") return false;
    try {
      return sameAddress(
        sdk.chainType,
        logAddress(log.address, sdk),
        logAddress(sdk.identityRegistry, sdk),
      );
    } catch {
      return false;
    }
  });
}

// TRON compares any address form directly; EVM goes through the SDK's conversion.
function logAddress(address: string, sdk: SDK): string {
  const raw = address.trim();
  return sdk.chainType === "tron" ? raw : sdk.chain.toEvmAddress(raw);
}
