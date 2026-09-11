import { SDK } from "@bankofai/8004-sdk";
import { Interface, type InterfaceAbi } from "ethers";
import type { AgentContractPorts } from "../../../application/ports/agent-registry.js";
import type { AgentRegistryReader } from "../../../application/ports/agent-sdk.js";
import type { ChainGatewayProvider } from "../../../application/ports/chain/gateway-provider.js";
import { UsageError } from "../../../domain/errors/index.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

interface SupportedNetwork {
  family: "evm" | "tron";
  chainId: string;
  sdkNetwork: string;
}

interface SdkNetwork {
  sdk: SDK;
  identity: Interface;
}

const UNUSED_RPC_URL = "https://unused.invalid";

const SUPPORTED_NETWORKS: Readonly<Record<string, SupportedNetwork>> = {
  "eip155:56": { family: "evm", chainId: "56", sdkNetwork: "eip155:56" },
  "eip155:97": { family: "evm", chainId: "97", sdkNetwork: "eip155:97" },
  "eip155:8453": { family: "evm", chainId: "8453", sdkNetwork: "eip155:8453" },
  "eip155:84532": { family: "evm", chainId: "84532", sdkNetwork: "eip155:84532" },
  "tron:728126428": {
    family: "tron",
    chainId: "728126428",
    sdkNetwork: "tron:mainnet",
  },
  "tron:3448148188": {
    family: "tron",
    chainId: "3448148188",
    sdkNetwork: "tron:nile",
  },
  "tron:2494104990": {
    family: "tron",
    chainId: "2494104990",
    sdkNetwork: "tron:shasta",
  },
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
  ): Promise<unknown> {
    const configured = this.#for(network);
    const response = await this.contracts[network.family].call(
      network,
      configured.sdk.identityRegistry,
      method,
      params,
    );
    const raw = network.family === "tron" ? response.result[0] : response.result;
    const data = String(raw ?? "");
    const decoded = configured.identity.decodeFunctionResult(
      method,
      data.startsWith("0x") ? data : `0x${data}`,
    );
    const value = decoded[0];
    const output = configured.identity.getFunction(method)?.outputs[0];
    return output?.baseType === "address"
      ? configured.sdk.chain.toChainAddress(String(value))
      : value;
  }

  async registeredAgentId(network: NetworkDescriptor, txId: string): Promise<string | undefined> {
    const configured = this.#for(network);
    if (network.family === "evm") {
      const receipt = await this.gateways.get(network, "evm").getTransactionReceipt(txId);
      if (!receipt) return undefined;
      const source = record(receipt.raw) ?? receipt;
      const logs = matchingLogs(source.logs, configured.sdk);
      return configured.sdk.chain.parseRegisteredAgentId({ logs });
    }

    const receipt = await this.gateways.get(network, "tron").getTransactionInfoById(txId);
    const logs = matchingLogs(receipt.log, configured.sdk);
    return configured.sdk.chain.parseRegisteredAgentId({ log: logs });
  }

  #for(network: NetworkDescriptor): SdkNetwork {
    const supported = SUPPORTED_NETWORKS[network.id];
    if (!supported) {
      throw new UsageError(
        "unsupported_network_capability",
        `ERC-8004 Identity Registry is not deployed on ${network.id}`,
      );
    }
    if (network.family !== supported.family || network.chainId !== supported.chainId) {
      throw new UsageError(
        "family_mismatch",
        `network descriptor ${network.id} does not match family ${network.family} and chain id ${network.chainId}`,
      );
    }
    const existing = this.#networks.get(network.id);
    if (existing) return existing;
    const sdk = new SDK({
      network: supported.sdkNetwork,
      chainId: Number(supported.chainId),
      rpcUrl: UNUSED_RPC_URL,
    });
    const configured = {
      sdk,
      identity: new Interface(sdk.identityRegistryAbi as unknown as InterfaceAbi),
    };
    this.#networks.set(network.id, configured);
    return configured;
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
      return normalizedAddress(log.address, sdk) === normalizedAddress(sdk.identityRegistry, sdk);
    } catch {
      return false;
    }
  });
}

function normalizedAddress(address: string, sdk: SDK): string {
  const raw = address.trim();
  if (sdk.chainType === "tron") {
    if (/^[0-9a-fA-F]{40}$/.test(raw)) return `0x${raw.toLowerCase()}`;
    if (/^41[0-9a-fA-F]{40}$/.test(raw)) return `0x${raw.slice(2).toLowerCase()}`;
  }
  return sdk.chain.toEvmAddress(raw).toLowerCase();
}
