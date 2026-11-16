import type { DispatchCheck } from "../../../../../plugin-api/application.js";
import { facilitatorUrl } from "./facilitator-url.js";
import type { NetworkDescriptor } from "../../../../../plugin-api/domain.js";
import { sameX402Network } from "../../../domain/network-id.js";
import { X402_FAMILIES } from "../../../domain/families.js";
import { TransportError, UsageError } from "../../../../../plugin-api/domain.js";
import { fetchBounded } from "../../../../../plugin-api/http.js";
import { rateLimitDetails } from "../../../../../plugin-api/http.js";
import { sdkPaymentError } from "./payment-error.js";

// Use the facilitator's own spelling of a network id where peers spell it differently.
export async function facilitatorNetwork(
  network: NetworkDescriptor,
  scheme: string,
  base: string,
  fetcher: typeof fetch,
  check: DispatchCheck,
): Promise<string> {
  if (!X402_FAMILIES[network.family].peerSpellingVaries) return network.id;
  let response: Response;
  try {
    response = await fetchBounded(
      fetcher,
      facilitatorUrl(base, "supported"),
      {
        method: "GET",
        headers: { accept: "application/json" },
        redirect: "error",
      },
      check,
      1024 * 1024,
    );
  } catch (error) {
    throw sdkPaymentError(error, "challenge");
  }
  if (!response.ok)
    throw new TransportError(
      response.status === 429 ? "provider_rate_limited" : "provider_error",
      "Could not determine facilitator support; no payment was authorized",
      {
        ...(response.status === 429
          ? rateLimitDetails(response.headers)
          : { httpStatus: response.status }),
        phase: "challenge",
        retryPayment: false,
      },
    );
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    // Report invalid JSON below.
  }
  const kinds = data && typeof data === "object" ? (data as { kinds?: unknown }).kinds : undefined;
  if (!Array.isArray(kinds))
    throw new TransportError(
      "invalid_x402_response",
      "Facilitator returned invalid supported capabilities; no payment was authorized",
    );
  const candidates = kinds.filter(
    (kind): kind is { network: string } =>
      kind &&
      typeof kind === "object" &&
      kind.x402Version === 2 &&
      kind.scheme === scheme &&
      typeof kind.network === "string" &&
      sameX402Network(kind.network, network.id),
  );
  const selected = candidates.find((kind) => kind.network === network.id) ?? candidates[0];
  if (!selected)
    throw new UsageError(
      "unsupported_network_capability",
      "Facilitator does not support this network and payment scheme in x402 v2",
    );
  return selected.network;
}
