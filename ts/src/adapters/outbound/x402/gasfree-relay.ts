import type { DispatchCheck } from "../../../application/contracts/deadline.js";
import { createHmac } from "node:crypto";
import {
  GasFreeAPIClient,
  getGasFreeApiBaseUrl,
  type GasFreeAddressInfo,
  type GasFreeProvider,
} from "@bankofai/x402-tron/gasfree";
import type {
  Config,
  NetworkDescriptor,
  TronNetworkDescriptor,
} from "../../../domain/types/index.js";
import { CliError, TransportError, UsageError } from "../../../domain/errors/index.js";
import { fetchBounded } from "../http/http-response.js";
import { rateLimitDetails } from "../http/json-service.js";
import { X402_FAMILIES } from "../../../domain/x402/families.js";

// Reads authorization data; the endpoint's facilitator submits payment.
export function gasfreeRelayClient(
  network: NetworkDescriptor,
  selection: string | undefined,
  config: Pick<Config, "gasfreeApiKey" | "gasfreeApiSecret">,
  // Undefined only to validate the selection; such a relay never reads.
  check: DispatchCheck | undefined,
  fetcher: typeof fetch,
): GasFreeAPIClient | undefined {
  if (selection === undefined || selection === "official") {
    if (!X402_FAMILIES[network.family].gasfree) return undefined;
    let official: string;
    try {
      official = getGasFreeApiBaseUrl(network.id);
    } catch {
      return undefined;
    }
    // The SDK's default relay, reached through the global fetch as the SDK's own client does, but
    // under the command's dispatch check.
    return new CheckedRelay(official.replace(/\/$/, ""), "GasFree relay", check, (input, init) =>
      globalThis.fetch(input, init),
    );
  }
  if (!X402_FAMILIES[network.family].gasfree)
    throw new UsageError("invalid_option", "GasFree relay selection requires TRON");
  const gasfree = (network as Partial<TronNetworkDescriptor>).gasfree;
  let base: string;
  let credentials: { key: string; secret: string } | undefined;
  if (selection === "gasfree") {
    if (!config.gasfreeApiKey || !config.gasfreeApiSecret)
      throw new UsageError(
        "gasfree_credentials_missing",
        "Configure gasfreeApiKey and gasfreeApiSecret before selecting the GasFree Open API",
      );
    if (!gasfree)
      throw new UsageError(
        "unsupported_network",
        "GasFree Open API is not configured for this network",
      );
    base = gasfree.baseUrl + gasfree.apiPrefix;
    credentials = { key: config.gasfreeApiKey, secret: config.gasfreeApiSecret };
  } else {
    let url: URL;
    try {
      url = new URL(selection);
    } catch {
      throw new UsageError(
        "invalid_value",
        "GasFree relay must be official, gasfree, or an HTTPS URL",
      );
    }
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
      throw new UsageError(
        "invalid_value",
        "GasFree relay must be an HTTPS URL without credentials, query or fragment",
      );
    base = url.toString();
  }
  return new CheckedRelay(
    base.replace(/\/$/, ""),
    "Selected GasFree relay",
    check,
    fetcher,
    credentials,
  );
}

class CheckedRelay extends GasFreeAPIClient {
  constructor(
    private readonly endpoint: string,
    // Names the relay in error messages.
    private readonly label: string,
    private readonly check: DispatchCheck | undefined,
    private readonly fetcher: typeof fetch,
    private readonly credentials?: { key: string; secret: string },
  ) {
    super(endpoint);
  }
  override async getProviders(): Promise<GasFreeProvider[]> {
    const data = await this.read("/api/v1/config/provider/all");
    if (!Array.isArray(data.providers))
      throw new TransportError("provider_error", `${this.label} returned invalid providers`);
    return data.providers as GasFreeProvider[];
  }
  override async getAddressInfo(user: string): Promise<GasFreeAddressInfo> {
    const data = await this.read(`/api/v1/address/${encodeURIComponent(user)}`);
    if (
      typeof data.gasFreeAddress !== "string" ||
      !Array.isArray(data.assets) ||
      !Number.isSafeInteger(data.nonce)
    )
      throw new TransportError(
        "provider_error",
        `${this.label} returned invalid account information`,
      );
    return data as unknown as GasFreeAddressInfo;
  }
  override async getNonce(user: string): Promise<number> {
    return (await this.getAddressInfo(user)).nonce;
  }
  private async read(suffix: string): Promise<Record<string, unknown>> {
    const target = new URL(this.endpoint + suffix);
    const headers: Record<string, string> = { accept: "application/json" };
    if (this.credentials) {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = createHmac("sha256", this.credentials.secret)
        .update(`GET${target.pathname}${timestamp}`)
        .digest("base64");
      headers.Timestamp = timestamp;
      headers.Authorization = `ApiKey ${this.credentials.key}:${signature}`;
    }
    // Preserve typed failures without exposing relay text or falling back to another relay.
    let response: Response;
    try {
      response = await fetchBounded(
        this.fetcher,
        target.toString(),
        { headers, redirect: "error" },
        this.check,
      );
    } catch (error) {
      if (error instanceof CliError) {
        throw new TransportError(error.code, `${this.label}: ${error.message}`, {
          ...error.details,
          retryPayment: false,
        });
      }
      throw new TransportError(
        "provider_error",
        `${this.label} request failed; no fallback was attempted`,
        { retryPayment: false },
      );
    }
    if (!response.ok) {
      const limited = response.status === 429;
      throw new TransportError(
        limited ? "provider_rate_limited" : "provider_error",
        limited
          ? `${this.label} is rate limited; wait before retrying`
          : `${this.label} returned HTTP ${response.status}; no fallback was attempted`,
        {
          ...(limited ? rateLimitDetails(response.headers) : { httpStatus: response.status }),
          retryPayment: false,
        },
      );
    }
    let result: { code?: unknown; data?: unknown } | undefined;
    try {
      result = (await response.json()) as { code?: unknown; data?: unknown };
    } catch {
      // Report invalid JSON below.
    }
    if (
      result?.code !== 200 ||
      !result.data ||
      typeof result.data !== "object" ||
      Array.isArray(result.data)
    ) {
      throw new TransportError(
        "invalid_x402_response",
        `${this.label} returned an unexpected response; no fallback was attempted`,
        { retryPayment: false },
      );
    }
    return result.data as Record<string, unknown>;
  }
}
