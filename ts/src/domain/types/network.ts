/**
 * SharedTypes — identity & network: NetworkId/Descriptor, Config, capabilities.
 */
import type { OutputMode } from "./primitives.js";

export type NetworkId = string; // canonical, e.g. "tron:nile"
export type AccountRef = string; // "wlt_x.0" (HD) / "wlt_k" (privateKey)

export type FeeModel = "legacy" | "eip1559" | "tron-resource" | "evm-gas";

/** fields shared by every family; `family` is the discriminant for the union below. */
interface NetworkBase {
  id: NetworkId;
  chainId: string;
  /**
   * Display symbol of this chain's native coin — TRX / ETH / BNB.
   *
   * A NETWORK fact, not a family one: `evm:1` and `evm:56` share every encoding and arithmetic
   * rule that makes them EVM, but their coins are ETH and BNB. Reading this off the family table
   * renders a BNB balance as ETH, which is a wallet naming the wrong currency. The family still
   * owns what is genuinely family-wide — the base-unit name (wei) and its decimals.
   */
  nativeSymbol: string;
  /**
   * A test network — its coin is not traded, so it has no USD value to report.
   *
   * Declared per network rather than guessed from the id: `evm:11155111` says nothing about
   * being a testnet, and a guess would be wrong for exactly the chains nobody checked.
   */
  testnet?: boolean;
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

/** EVM network. Reached over JSON-RPC; `chainId` is the EIP-155 chain id as a decimal string —
 *  the same value the canonical id's second segment carries. */
export interface EvmNetworkDescriptor extends NetworkBase {
  family: "evm";
  httpEndpoint?: string;
}

/** The discriminated union every chain-facing type narrows on via `family`. */
export type NetworkDescriptor = TronNetworkDescriptor | EvmNetworkDescriptor;

/** Narrows to the TRON descriptor. TRON-only features (GasFree, TronLink multi-sign) read fields
 *  that simply do not exist on other families, so they must narrow before reaching for them. */
export function isTronNetwork(network: NetworkDescriptor): network is TronNetworkDescriptor {
  return network.family === "tron";
}

/**
 * The host of an endpoint URL — what listings show instead of the URL itself.
 *
 * A commercial RPC endpoint carries its API key IN THE URL (`…/v2/<key>`, `…?apikey=<key>`), and
 * §2.2 tells users to configure exactly that. Any output that prints an endpoint it was not
 * explicitly asked for therefore prints a credential — and `chain node` is the command whose
 * output people paste into issues and CI logs. Trimming to the host is the one cut that needs no
 * guess about which path segment is the secret.
 *
 * `config networks.<id>.httpEndpoint` remains the way to read the full URL: named reads give the
 * whole value, listings do not. Returns "" for a missing or unparseable URL.
 */
export function endpointHost(url: unknown): string {
  if (typeof url !== "string" || url === "") return "";
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

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
  /** short human-typed names for canonical ids (ADR-0010). Consulted ONLY when resolving
   *  `--network`; nothing downstream ever sees an alias. */
  aliases: Record<string, NetworkId>;
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
