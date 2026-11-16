import type { CapabilityPredicate } from "../../../plugin-api/application.js";
import { networkBlock } from "../../../plugin-api/domain.js";
import { gasfreeNetworkConfig } from "../domain/network.js";

const gasfree: CapabilityPredicate = (network) =>
  gasfreeNetworkConfig(network, networkBlock(network, "gasfree")) !== undefined
    ? "supported"
    : "unsupported";

export const GASFREE_CAPABILITIES: Readonly<Record<string, CapabilityPredicate>> = {
  "gasfree.info": gasfree,
  "gasfree.transfer": gasfree,
  "gasfree.trace": gasfree,
};

// The token a transfer uses when the caller names none.
export const GASFREE_DEFAULT_TOKEN = "USDT";
