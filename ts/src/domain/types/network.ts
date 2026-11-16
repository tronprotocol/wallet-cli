import type { OutputMode } from "./primitives.js";

export type NetworkId = string; // canonical, e.g. "tron:3448148188"
export type AccountRef = string; // "wlt_x.0" (HD) / "wlt_k" (privateKey)
// The account a command acts on: an AccountRef, or an address the account store resolves per family.
export type AccountSelector = AccountRef | string;

export type FeeModel = "legacy" | "eip1559" | "tron-resource" | "evm-gas";

interface NetworkBase {
  id: NetworkId;
  chainId: string;
  // Native coin symbol varies by network within a family (e.g. ETH vs BNB).
  nativeSymbol: string;
  // Testnet coins have no USD valuation.
  testnet?: boolean;
  feeModel?: FeeModel;
  capabilities: string[];
  // RPC authentication header; apiKey must be masked in output and stored with mode 0600.
  apiKeyHeader?: string;
  apiKey?: string;
  // Per-network blocks that are not core fields, as the user wrote them, by block name.
  extensions?: Readonly<Record<string, JsonValue>>;
}

// httpEndpoint is a FullNode HTTP REST endpoint, not gRPC or EVM JSON-RPC.
export interface TronNetworkDescriptor extends NetworkBase {
  family: "tron";
  httpEndpoint?: string;
  // TronLink service URL; credentials are stored separately in Config.
  tronlinkHttpEndpoint?: string;
}

// JSON-RPC network; chainId is a decimal EIP-155 id.
export interface EvmNetworkDescriptor extends NetworkBase {
  family: "evm";
  httpEndpoint?: string;
}

export type NetworkDescriptor = TronNetworkDescriptor | EvmNetworkDescriptor;

export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

// A per-network block: whether the user wrote it, and its value when they did.
export type NetworkBlock =
  { readonly present: false } | { readonly present: true; readonly value: JsonValue };

export function networkBlock(network: NetworkDescriptor, name: string): NetworkBlock {
  const extensions = network.extensions;
  return extensions !== undefined && Object.hasOwn(extensions, name)
    ? { present: true, value: extensions[name] as JsonValue }
    : { present: false };
}

export function isTronNetwork(network: NetworkDescriptor): network is TronNetworkDescriptor {
  return network.family === "tron";
}

// Returns host only to avoid exposing URL credentials; invalid or missing URLs return empty.
export function endpointHost(url: unknown): string {
  if (typeof url !== "string" || url === "") return "";
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

export interface Config {
  // Used when --network is omitted.
  defaultNetwork?: string;
  defaultOutput: OutputMode;
  // Default command deadline; 0 means no deadline.
  timeoutMs: number;
  // Base URL of the npm registry that plugin packages come from.
  pluginRegistry: string;
  networks: Record<NetworkId, NetworkDescriptor>;
  // Resolve to canonical ids at the --network boundary.
  aliases: Record<string, NetworkId>;
  // Portfolio valuation; defaults to CoinGecko.
  price?: PriceConfig;
  tronlinkSecretId?: string;
  tronlinkSecretKey?: string;
  tronlinkChannel?: string;
  // Mask GasFree credentials in output.
  gasfreeApiKey?: string;
  gasfreeApiSecret?: string;
  // Mask the B.AI bearer key in output.
  baiApiKey?: string;
}

// Optional service fields enable capabilities; contract addresses come from SDK chain config.
// Valuation failures must not fail balance reads.
export interface PriceConfig {
  provider: "coingecko" | "none";
  baseUrl?: string;
}
