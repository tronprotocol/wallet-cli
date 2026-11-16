import { networkBlock, type NetworkDescriptor } from "../../plugin-api/domain.js";
import { gasfreeNetworkConfig, type GasFreeNetworkConfig } from "./domain/network.js";

// The GasFree service of a network, as the plugin resolves it; x402 relays through it.
export function gasfreeOpenApi(
  network: NetworkDescriptor,
): GasFreeNetworkConfig | null | undefined {
  return gasfreeNetworkConfig(network, networkBlock(network, "gasfree"));
}
