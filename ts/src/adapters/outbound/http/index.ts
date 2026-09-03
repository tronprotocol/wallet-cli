import type { NetworkDescriptor } from "../../../domain/types/index.js";

export interface HttpEndpointConfig {
  readonly endpoint: string;
  readonly timeoutMs: number;
  readonly headers: Readonly<Record<string, string>>;
}

export interface HttpRequest {
  readonly method: "GET" | "POST";
  readonly path?: string;
  readonly body?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface HttpTransport {
  requestText(request: HttpRequest): Promise<string>;
}

export type HttpTransportErrorKind =
  "invalid_endpoint" | "invalid_request" | "timeout" | "network" | "http_status" | "redirect";

/** Safe internal transport failure. It deliberately carries no URL, body, header, or remote text. */
export class HttpTransportError extends Error {
  constructor(
    public readonly kind: HttpTransportErrorKind,
    public readonly status?: number,
  ) {
    super(status === undefined ? `HTTP transport ${kind}` : `HTTP transport ${kind}: ${status}`);
    this.name = "HttpTransportError";
  }
}

export function httpTransportFailure(error: HttpTransportError): string {
  if (error.kind === "timeout") return "request timed out";
  if (error.kind === "http_status" && error.status !== undefined) return `HTTP ${error.status}`;
  if (error.kind === "invalid_endpoint") return "invalid HTTP endpoint";
  if (error.kind === "invalid_request") return "invalid HTTP request";
  return "network request failed";
}

type FetchFunction = typeof globalThis.fetch;

/** Resolve the HTTP mechanics shared by every adapter that uses a network's httpEndpoint. */
export function networkHttpConfig(
  network: NetworkDescriptor,
  timeoutMs: number,
): HttpEndpointConfig {
  assertHttpEndpoint(network.httpEndpoint ?? "");
  const headers =
    network.apiKeyHeader && network.apiKey ? { [network.apiKeyHeader]: network.apiKey } : {};
  return {
    endpoint: network.httpEndpoint ?? "",
    timeoutMs,
    headers,
  };
}

function assertHttpEndpoint(endpoint: string): void {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new HttpTransportError("invalid_endpoint");
    }
  } catch (error) {
    if (error instanceof HttpTransportError) throw error;
    throw new HttpTransportError("invalid_endpoint");
  }
}

/** Native HTTP adapter. Protocol-specific parsing deliberately stays above this interface. */
export class FetchHttpTransport implements HttpTransport {
  constructor(
    private readonly config: HttpEndpointConfig,
    private readonly fetchFn: FetchFunction = globalThis.fetch,
  ) {}

  async requestText(request: HttpRequest): Promise<string> {
    const headers = new Headers(request.headers);
    for (const [name, value] of Object.entries(this.config.headers)) headers.set(name, value);
    try {
      const response = await this.fetchFn(requestUrl(this.config.endpoint, request.path), {
        method: request.method,
        headers,
        body: request.body,
        signal: AbortSignal.timeout(this.config.timeoutMs),
        ...(Object.keys(this.config.headers).length === 0 ? {} : { redirect: "error" }),
      });
      if (!response.ok) throw new HttpTransportError("http_status", response.status);
      return await response.text();
    } catch (error) {
      if (error instanceof HttpTransportError) throw error;
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError")
      ) {
        throw new HttpTransportError("timeout");
      }
      throw new HttpTransportError("network");
    }
  }
}

function requestUrl(endpoint: string, path: string | undefined): string {
  assertHttpEndpoint(endpoint);
  const url = new URL(endpoint);
  if (path === undefined) return endpoint;
  if (/^[A-Za-z][A-Za-z\d+.-]*:/.test(path) || /^[/\\]{2}/.test(path)) {
    throw new HttpTransportError("invalid_request");
  }
  const [pathname, query = ""] = path.split("?", 2);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${pathname!.replace(/^\/+/, "")}`;
  for (const [name, value] of new URLSearchParams(query)) url.searchParams.append(name, value);
  return url.toString();
}
