import { describe, expect, it, vi } from "vitest";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { FetchHttpTransport, networkHttpConfig } from "./index.js";

const network = (overrides: Partial<NetworkDescriptor> = {}): NetworkDescriptor =>
  ({
    id: "evm:1",
    family: "evm",
    chainId: "1",
    nativeSymbol: "ETH",
    capabilities: [],
    httpEndpoint: "https://rpc.example/v2/url-key",
    ...overrides,
  }) as NetworkDescriptor;

describe("networkHttpConfig", () => {
  it("turns a complete network API-key pair into the request header", () => {
    expect(
      networkHttpConfig(
        network({ apiKeyHeader: "X-Provider-Key", apiKey: "header-secret" }),
        12_345,
      ),
    ).toEqual({
      endpoint: "https://rpc.example/v2/url-key",
      timeoutMs: 12_345,
      headers: { "X-Provider-Key": "header-secret" },
    });
  });

  it.each([
    {
      label: "header only",
      credentials: { apiKeyHeader: "X-Provider-Key", apiKey: undefined },
    },
    { label: "key only", credentials: { apiKeyHeader: undefined, apiKey: "header-secret" } },
  ] as const)("emits no credential for an incomplete pair: $label", ({ credentials }) => {
    expect(networkHttpConfig(network(credentials), 12_345).headers).toEqual({});
  });
});

describe("FetchHttpTransport", () => {
  it("sends the network credential and returns the response as raw text", async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), init });
      return new Response('{"amount":9007199254740993}', { status: 200 });
    };
    const transport = new FetchHttpTransport(
      networkHttpConfig(
        network({ apiKeyHeader: "X-Provider-Key", apiKey: "header-secret" }),
        12_345,
      ),
      fetchFn,
    );

    const text = await transport.requestText({
      method: "POST",
      path: "/wallet/getaccount",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    expect(text).toBe('{"amount":9007199254740993}');
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe("https://rpc.example/v2/url-key/wallet/getaccount");
    const headers = new Headers(seen[0]!.init?.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-provider-key")).toBe("header-secret");
  });

  it("lets the network credential override a protocol header case-insensitively", async () => {
    let sent: Headers | undefined;
    const transport = new FetchHttpTransport(
      networkHttpConfig(
        network({ apiKeyHeader: "X-Provider-Key", apiKey: "network-secret" }),
        12_345,
      ),
      async (_url, init) => {
        sent = new Headers(init?.headers);
        return new Response("{}", { status: 200 });
      },
    );

    await transport.requestText({
      method: "POST",
      headers: { "x-provider-key": "caller-value" },
      body: "{}",
    });

    expect(sent?.get("X-Provider-Key")).toBe("network-secret");
  });

  it("rejects an absolute request URL before credentials can leave their endpoint", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const transport = new FetchHttpTransport(
      networkHttpConfig(
        network({ apiKeyHeader: "X-Provider-Key", apiKey: "header-secret" }),
        12_345,
      ),
      fetchFn,
    );

    await expect(
      transport.requestText({ method: "GET", path: "https://attacker.example/collect" }),
    ).rejects.toMatchObject({ name: "HttpTransportError", kind: "invalid_request" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("turns a non-success status into a safe typed error without exposing the response", async () => {
    const transport = new FetchHttpTransport(
      networkHttpConfig(network(), 12_345),
      async () => new Response("server leaked header-secret", { status: 429 }),
    );

    const error = await transport
      .requestText({ method: "POST", body: "request held header-secret" })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      name: "HttpTransportError",
      kind: "http_status",
      status: 429,
    });
    expect(String(error)).not.toContain("header-secret");
  });

  it("aborts at the configured deadline and reports a typed timeout", async () => {
    const transport = new FetchHttpTransport(
      networkHttpConfig(network(), 10),
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("secret network detail", "AbortError")),
          );
        }),
    );

    await expect(transport.requestText({ method: "GET" })).rejects.toMatchObject({
      name: "HttpTransportError",
      kind: "timeout",
    });
  });

  it("refuses to follow redirects whenever a network credential is attached", async () => {
    let init: RequestInit | undefined;
    const transport = new FetchHttpTransport(
      networkHttpConfig(
        network({ apiKeyHeader: "X-Provider-Key", apiKey: "header-secret" }),
        12_345,
      ),
      async (_url, requestInit) => {
        init = requestInit;
        return new Response("{}", { status: 200 });
      },
    );

    await transport.requestText({ method: "GET" });
    expect(init?.redirect).toBe("error");
  });

  it("rejects a missing endpoint before attempting I/O", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const transport = new FetchHttpTransport(
      { endpoint: "", timeoutMs: 12_345, headers: {} },
      fetchFn,
    );

    await expect(transport.requestText({ method: "POST", body: "{}" })).rejects.toMatchObject({
      name: "HttpTransportError",
      kind: "invalid_endpoint",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
