import { networkBlock, type NetworkDescriptor } from "../../plugin-api/domain.js";
import { gasfreeNetworkConfig, type GasFreeNetworkConfig } from "./domain/network.js";
import { GASFREE_ERROR_CODES } from "./domain/errors.js";

export { GASFREE_CREDENTIALS } from "./domain/credentials.js";

// The codes a plugin that relays through GasFree can raise from GasFree's own code.
export const GASFREE_SHARED_ERROR_CODES = {
  gasfree_credentials_missing: GASFREE_ERROR_CODES.gasfree_credentials_missing,
};

// The GasFree service of a network, as the plugin resolves it; x402 relays through it.
export function gasfreeOpenApi(
  network: NetworkDescriptor,
): GasFreeNetworkConfig | null | undefined {
  return gasfreeNetworkConfig(network, networkBlock(network, "gasfree"));
}
