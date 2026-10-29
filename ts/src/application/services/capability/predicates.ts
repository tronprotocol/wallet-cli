import {
  isTronNetwork,
  type GasFreeNetworkConfig,
  type NetworkDescriptor,
  type TronNetworkDescriptor,
} from "../../../domain/types/network.js";

// "needs-inputs": supported, but only when the caller supplies inputs that other networks default.
export type CapabilitySupport = "supported" | "needs-inputs" | "unsupported";

// Facts a predicate reads that the network descriptor does not carry.
export interface CapabilityFacts {
  // Whether x402 serve has a registered default payment token on the network.
  x402ServeDefaultToken(network: NetworkDescriptor): boolean;
}

type Predicate = (network: NetworkDescriptor, facts: CapabilityFacts) => CapabilitySupport;

// Networks with an ERC-8004 Identity Registry deployment.
const ERC8004_NETWORKS: ReadonlySet<string> = new Set([
  "eip155:56",
  "eip155:97",
  "eip155:8453",
  "eip155:84532",
  "tron:728126428",
  "tron:3448148188",
  "tron:2494104990",
]);

const when = (supported: boolean): CapabilitySupport => (supported ? "supported" : "unsupported");

const tron =
  (enabled: (network: TronNetworkDescriptor) => boolean): Predicate =>
  (network) =>
    when(isTronNetwork(network) && enabled(network));

// The GasFree service of the network, when the network offers GasFree.
export function gasfreeService(network: NetworkDescriptor): GasFreeNetworkConfig | undefined {
  return isTronNetwork(network) ? network.gasfree : undefined;
}

// Whether the network has the SunSwap market API, which is also its price source.
export function hasSunSwapMarket(network: NetworkDescriptor): boolean {
  return isTronNetwork(network) && Boolean(network.sunswap?.marketApiBaseUrl);
}

// The B.AI chain name of the network, when B.AI accepts recharges on it.
export function baiChain(network: NetworkDescriptor): string | undefined {
  if (network.family === "evm" && network.chainId === "56") return "bnb";
  if (network.family === "evm" && network.chainId === "8453") return "base";
  if (network.family === "tron" && network.chainId === "728126428") return "tron";
}

const gasfree: Predicate = (network) => when(gasfreeService(network) !== undefined);
const erc8004: Predicate = (network) => when(ERC8004_NETWORKS.has(network.id));

// Capabilities absent here depend only on the family, which the command's bindings decide.
const PREDICATES: Readonly<Record<string, Predicate>> = {
  "tx.multisig.tronlink": tron((n) => Boolean(n.tronlinkHttpEndpoint)),
  "gasfree.info": gasfree,
  "gasfree.transfer": gasfree,
  "gasfree.trace": gasfree,
  "sunswap.market": (network) => when(hasSunSwapMarket(network)),
  // Contract liquidity can be available without a market API.
  "sunswap.liquidity": tron((n) => n.sunswap?.liquidity === true),
  // Curve access requires explicit configuration, even when SDK addresses exist.
  "sunpump.curve": tron((n) => n.sunpump?.curve === true),
  "sunpump.market": tron((n) => Boolean(n.sunpump?.apiBaseUrl)),
  "sunpump.launch": tron((n) => Boolean(n.sunpump?.apiBaseUrl)),
  "sunswap.swap": tron((n) => n.sunpump?.curve === true || Boolean(n.sunswap?.routerApiBaseUrl)),
  "erc8004.identity.read": erc8004,
  "erc8004.identity.write": erc8004,
  "bai.recharge": (network) => when(baiChain(network) !== undefined),
  // Without a default token the server needs an explicit token, or an asset with its decimals.
  "x402.serve": (network, facts) =>
    facts.x402ServeDefaultToken(network) ? "supported" : "needs-inputs",
};

export function capabilitySupport(
  capability: string,
  network: NetworkDescriptor,
  facts: CapabilityFacts,
): CapabilitySupport {
  return PREDICATES[capability]?.(network, facts) ?? "supported";
}
