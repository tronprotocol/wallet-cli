import { createHmac } from "node:crypto";
import {
  GasFreeAPIClient,
  type GasFreeAddressInfo,
  type GasFreeProvider,
} from "@bankofai/x402-tron/gasfree";
import type { Config, NetworkDescriptor } from "../../../domain/types/index.js";
import { TransportError, UsageError } from "../../../domain/errors/index.js";
import { fetchBounded } from "../http/http-response.js";

/** Read-only relay configuration used by the SDK to build the payer authorization.
 * Submission remains the protected endpoint's facilitator responsibility. */
export function gasfreeRelayClient(
  network: NetworkDescriptor,
  selection: string | undefined,
  config: Pick<Config, "gasfreeApiKey" | "gasfreeApiSecret">,
  timeout: number,
  fetcher: typeof fetch,
): GasFreeAPIClient | undefined {
  if (selection === undefined || selection === "official") return undefined;
  if (network.family !== "tron")
    throw new UsageError("invalid_option", "GasFree relay selection requires TRON");
  let base: string;
  let credentials: { key: string; secret: string } | undefined;
  if (selection === "gasfree") {
    if (!config.gasfreeApiKey || !config.gasfreeApiSecret)
      throw new UsageError(
        "gasfree_credentials_missing",
        "Configure gasfreeApiKey and gasfreeApiSecret before selecting the GasFree Open API",
      );
    if (!network.gasfree)
      throw new UsageError(
        "unsupported_network",
        "GasFree Open API is not configured for this network",
      );
    base = network.gasfree.baseUrl + network.gasfree.apiPrefix;
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
  return new SelectedRelay(base.replace(/\/$/, ""), timeout, fetcher, credentials);
}

class SelectedRelay extends GasFreeAPIClient {
  constructor(
    private readonly endpoint: string,
    private readonly timeout: number,
    private readonly fetcher: typeof fetch,
    private readonly credentials?: { key: string; secret: string },
  ) {
    super(endpoint);
  }
  override async getProviders(): Promise<GasFreeProvider[]> {
    const data = await this.read("/api/v1/config/provider/all");
    if (!Array.isArray(data.providers))
      throw new TransportError("provider_error", "GasFree relay returned invalid providers");
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
        "GasFree relay returned invalid account information",
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
    try {
      const response = await fetchBounded(
        this.fetcher,
        target.toString(),
        { headers, redirect: "error" },
        this.timeout,
      );
      if (!response.ok) throw new Error();
      const result = (await response.json()) as { code?: unknown; data?: unknown };
      if (
        result.code !== 200 ||
        !result.data ||
        typeof result.data !== "object" ||
        Array.isArray(result.data)
      )
        throw new Error();
      return result.data as Record<string, unknown>;
    } catch {
      throw new TransportError(
        "provider_error",
        "Selected GasFree relay request failed; no fallback was attempted",
        { retryPayment: false },
      );
    }
  }
}
