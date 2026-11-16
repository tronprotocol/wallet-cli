import type { CapabilityPredicate } from "../../../plugin-api/application.js";
import type { NetworkDescriptor } from "../../../plugin-api/domain.js";

// The token `x402 serve` uses when the caller names none.
export const X402_SERVE_DEFAULT_TOKEN = "USDT";

// Whether the facilitator registers the token symbol on the network.
export type TokenRegistered = (network: NetworkDescriptor, symbol: string) => boolean;

export function x402Capabilities(
  registered: TokenRegistered,
): Readonly<Record<string, CapabilityPredicate>> {
  return {
    // Without a default token the server needs an explicit token, or an asset with its decimals.
    "x402.serve": (network) =>
      registered(network, X402_SERVE_DEFAULT_TOKEN) ? "supported" : "needs-inputs",
  };
}
