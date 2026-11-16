import type { CapabilityPredicate } from "../../../plugin-api/application.js";

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

const erc8004: CapabilityPredicate = (network) =>
  ERC8004_NETWORKS.has(network.id) ? "supported" : "unsupported";

export const ERC8004_CAPABILITIES: Readonly<Record<string, CapabilityPredicate>> = {
  "erc8004.identity.read": erc8004,
  "erc8004.identity.write": erc8004,
};
