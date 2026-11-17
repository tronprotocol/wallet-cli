import {
  isTronNetwork,
  type NetworkBlock,
  type NetworkDescriptor,
} from "../../../plugin-api/domain.js";

export interface GasFreeNetworkConfig {
  // HTTPS origin only; the adapter appends paths.
  baseUrl: string;
  apiPrefix: string;
  // Decimal uint256.
  controllerChainId: string;
  verifyingContract: string;
}

// GasFree service and TIP-712 controller domain, by canonical network id.
export const GASFREE_NETWORK_DEFAULTS: Readonly<Record<string, GasFreeNetworkConfig>> = {
  "tron:728126428": {
    baseUrl: "https://open.gasfree.io",
    apiPrefix: "/tron",
    controllerChainId: "728126428",
    verifyingContract: "TFFAMQLZybALaLb4uxHA9RBE7pxhUAjF3U",
  },
  "tron:3448148188": {
    baseUrl: "https://open-test.gasfree.io",
    apiPrefix: "/nile",
    controllerChainId: "3448148188",
    verifyingContract: "THQGuFzL87ZqhxkgqYEryRAd7gqFqL5rdc",
  },
};

// A block the user wrote replaces the defaults whole, unchecked: the adapter refuses a bad
// endpoint or prefix when a command uses it. A written null leaves the network without GasFree.
export function gasfreeNetworkConfig(
  network: NetworkDescriptor,
  block: NetworkBlock,
): GasFreeNetworkConfig | null | undefined {
  if (!isTronNetwork(network)) return undefined;
  if (block.present) return block.value as unknown as GasFreeNetworkConfig | null;
  return Object.hasOwn(GASFREE_NETWORK_DEFAULTS, network.id)
    ? GASFREE_NETWORK_DEFAULTS[network.id]
    : undefined;
}
