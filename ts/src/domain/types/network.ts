import type { OutputMode } from "./primitives.js";

export type NetworkId = string; // canonical, e.g. "tron:3448148188"
export type AccountRef = string; // "wlt_x.0" (HD) / "wlt_k" (privateKey)

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
}

// httpEndpoint is a FullNode HTTP REST endpoint, not gRPC or EVM JSON-RPC.
export interface TronNetworkDescriptor extends NetworkBase {
  family: "tron";
  httpEndpoint?: string;
  // TronLink service URL; credentials are stored separately in Config.
  tronlinkHttpEndpoint?: string;
  // GasFree service and TIP-712 controller domain.
  gasfree?: GasFreeNetworkConfig;
  sunswap?: SunSwapNetworkConfig;
  sunpump?: SunPumpNetworkConfig;
}

// JSON-RPC network; chainId is a decimal EIP-155 id.
export interface EvmNetworkDescriptor extends NetworkBase {
  family: "evm";
  httpEndpoint?: string;
}

export type NetworkDescriptor = TronNetworkDescriptor | EvmNetworkDescriptor;

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
  timeoutMs: number;
  // Default --wait polling cap; --wait-timeout overrides it.
  waitTimeoutMs: number;
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

export interface GasFreeNetworkConfig {
  // HTTPS origin only; the adapter appends paths.
  baseUrl: string;
  apiPrefix: string;
  // Decimal uint256.
  controllerChainId: string;
  verifyingContract: string;
}

// Optional service fields enable capabilities; contract addresses come from SDK chain config.
export interface SunSwapNetworkConfig {
  // HTTPS origin only; the adapter appends paths.
  marketApiBaseUrl?: string;
  routerApiBaseUrl?: string;
  // Enables liquidity commands and position-info.
  liquidity?: boolean;
}

export interface SunPumpNetworkConfig {
  // Enables sunpump buy/sell and the curve branch of sunswap swap.
  curve?: boolean;
  // Catalogue API URL; absent disables catalogue reads independently of curve trading.
  apiBaseUrl?: string;
}

// Valuation failures must not fail balance reads.
export interface PriceConfig {
  provider: "coingecko" | "none";
  baseUrl?: string;
}
