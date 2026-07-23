/**
 * SharedTypes — identity & network: NetworkId/Descriptor, Config, capabilities.
 */
import type { OutputMode } from "./primitives.js";

export type NetworkId = string; // canonical, e.g. "tron:nile"
export type AccountRef = string; // "wlt_x.0" (HD) / "wlt_k" (privateKey)

export type FeeModel = "legacy" | "eip1559" | "tron-resource";

/** fields shared by every family; `family` is the discriminant for the union below. */
interface NetworkBase {
  id: NetworkId;
  chainId: string;
  aliases: string[];
  feeModel?: FeeModel;
  capabilities: string[];
}

/** TRON network. Reached via tronweb, which is HTTP-based — `httpEndpoint` is a FullNode HTTP REST
 *  fullHost (NOT gRPC :50051 nor the eth-style JSON-RPC). Self-hosting → point it at your node's :8090. */
export interface TronNetworkDescriptor extends NetworkBase {
  family: "tron";
  httpEndpoint?: string;
  /** Official walletadapter multi-sign service. Credentials are stored separately in Config. */
  tronlinkHttpEndpoint?: string;
  /** Official GasFree service plus the immutable TIP-712 controller domain. */
  gasfree?: GasFreeNetworkConfig;
}

/** Single family today (TRON). Kept as a named alias so adding a family later means re-introducing
 *  a discriminated union here without churn at every reference. */
export type NetworkDescriptor = TronNetworkDescriptor;

export interface CapabilityDescriptor {
  key: string;
  summary: string;
}

export interface Config {
  /** one concrete default network for all chain commands when --network is omitted. */
  defaultNetwork?: string;
  defaultOutput: OutputMode;
  timeoutMs: number;
  /** default polling cap for broadcast commands' --wait, in ms (overridden by --wait-timeout). */
  waitTimeoutMs: number;
  networks: Record<NetworkId, NetworkDescriptor>;
  /** USD-valuation source for `account portfolio`. Missing → builtin CoinGecko. */
  price?: PriceConfig;
  /** TronLink collaboration credentials for the currently selected service environment. */
  tronlinkSecretId?: string;
  tronlinkSecretKey?: string;
  tronlinkChannel?: string;
  /** GasFree Open Platform credentials. The secret is never rendered in clear text. */
  gasfreeApiKey?: string;
  gasfreeApiSecret?: string;
}

export interface GasFreeNetworkConfig {
  /** HTTPS origin only; request paths are appended by the GasFree adapter. */
  baseUrl: string;
  apiPrefix: string;
  /** Decimal uint256 value to avoid passing chain identifiers through floating point. */
  controllerChainId: string;
  verifyingContract: string;
}

/** price service config ; best-effort — failures never fail a balance read. */
export interface PriceConfig {
  provider: "coingecko" | "none";
  baseUrl?: string;
}
