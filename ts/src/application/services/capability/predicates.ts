import {
  isTronNetwork,
  type NetworkDescriptor,
  type TronNetworkDescriptor,
} from "../../../domain/types/network.js";

// "needs-inputs": supported, but only when the caller supplies inputs that other networks default.
export type CapabilitySupport = "supported" | "needs-inputs" | "unsupported";

// A capability predicate; it decides from the network alone.
export type CapabilityPredicate = (network: NetworkDescriptor) => CapabilitySupport;

const when = (supported: boolean): CapabilitySupport => (supported ? "supported" : "unsupported");

const tron =
  (enabled: (network: TronNetworkDescriptor) => boolean): CapabilityPredicate =>
  (network) =>
    when(isTronNetwork(network) && enabled(network));

// Capabilities absent here depend only on the family, which the command's bindings decide.
const PREDICATES: Readonly<Record<string, CapabilityPredicate>> = {
  "tx.multisig.tronlink": tron((n) => Boolean(n.tronlinkHttpEndpoint)),
};

export function isCoreCapability(capability: string): boolean {
  return Object.hasOwn(PREDICATES, capability);
}

export function capabilitySupport(
  capability: string,
  network: NetworkDescriptor,
  registered: ReadonlyMap<string, CapabilityPredicate> = new Map(),
): CapabilitySupport {
  if (Object.hasOwn(PREDICATES, capability)) return PREDICATES[capability]!(network);
  return registered.get(capability)?.(network) ?? "supported";
}
