import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { sameX402Network } from "../../../domain/x402/network-id.js";
import { TransportError, UsageError } from "../../../domain/errors/index.js";
import { fetchBounded } from "../http/http-response.js";
import { sdkPaymentError } from "./payment-error.js";

/** Negotiate TRON's wire representation before advertising or signing any requirement. */
export async function facilitatorNetwork(
  network: NetworkDescriptor,
  scheme: string,
  base: string,
  fetcher: typeof fetch,
  timeoutMs: number,
): Promise<string> {
  if (network.family !== "tron") return network.id;
  let response: Response;
  try {
    response = await fetchBounded(
      fetcher,
      new URL("/supported", base),
      {
        method: "GET",
        headers: { accept: "application/json" },
        redirect: "error",
      },
      timeoutMs,
      1024 * 1024,
    );
  } catch (error) {
    throw sdkPaymentError(error, "challenge");
  }
  if (!response.ok)
    throw new TransportError(
      response.status === 429 ? "provider_rate_limited" : "provider_error",
      "Could not determine facilitator support; no payment was authorized",
      { httpStatus: response.status, phase: "challenge", retryPayment: false },
    );
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    /* handled below */
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
  // Prefer canonical decimal if supported; otherwise use the facilitator's exact advertised ID.
  const selected = candidates.find((kind) => kind.network === network.id) ?? candidates[0];
  if (!selected)
    throw new UsageError(
      "unsupported_network_capability",
      "Facilitator does not support this network and payment scheme in x402 v2",
    );
  return selected.network;
}
