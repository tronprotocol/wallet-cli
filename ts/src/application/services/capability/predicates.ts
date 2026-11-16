import {
  isTronNetwork,
  type NetworkDescriptor,
  type TronNetworkDescriptor,
} from "../../../domain/types/network.js";
import { defaultToken } from "../default-token.js";

// "needs-inputs": supported, but only when the caller supplies inputs that other networks default.
export type CapabilitySupport = "supported" | "needs-inputs" | "unsupported";

// Facts a predicate reads that the network descriptor does not carry.
export interface CapabilityFacts {
  // Whether the x402 integration registers the token symbol on the network.
  x402TokenRegistered(network: NetworkDescriptor, symbol: string): boolean;
}

type Predicate = (network: NetworkDescriptor, facts: CapabilityFacts) => CapabilitySupport;

// A capability predicate a plugin registers; it decides from the network alone.
export type CapabilityPredicate = (network: NetworkDescriptor) => CapabilitySupport;

const when = (supported: boolean): CapabilitySupport => (supported ? "supported" : "unsupported");

const tron =
  (enabled: (network: TronNetworkDescriptor) => boolean): Predicate =>
  (network) =>
    when(isTronNetwork(network) && enabled(network));

// The B.AI chain name of the network, when B.AI accepts recharges on it.
export function baiChain(network: NetworkDescriptor): string | undefined {
  if (network.family === "evm" && network.chainId === "56") return "bnb";
  if (network.family === "evm" && network.chainId === "8453") return "base";
  if (network.family === "tron" && network.chainId === "728126428") return "tron";
}

// Capabilities absent here depend only on the family, which the command's bindings decide.
const PREDICATES: Readonly<Record<string, Predicate>> = {
  "tx.multisig.tronlink": tron((n) => Boolean(n.tronlinkHttpEndpoint)),
  "bai.recharge": (network) => when(baiChain(network) !== undefined),
  // Without a default token the server needs an explicit token, or an asset with its decimals.
  "x402.serve": (network, facts) =>
    facts.x402TokenRegistered(network, defaultToken("x402.serve", network.id))
      ? "supported"
      : "needs-inputs",
};

export function isCoreCapability(capability: string): boolean {
  return Object.hasOwn(PREDICATES, capability);
}

export function capabilitySupport(
  capability: string,
  network: NetworkDescriptor,
  facts: CapabilityFacts,
  registered: ReadonlyMap<string, CapabilityPredicate> = new Map(),
): CapabilitySupport {
  if (Object.hasOwn(PREDICATES, capability)) return PREDICATES[capability]!(network, facts);
  return registered.get(capability)?.(network) ?? "supported";
}
