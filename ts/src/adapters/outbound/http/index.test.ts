import { describe, expect, it, vi } from "vitest";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { FetchHttpTransport, networkHttpConfig } from "./index.js";
import { withDispatchCheck } from "./dispatch-context.js";
import { expiredCheck } from "./__test-support__/dispatch.js";
import { DeadlineExpiredError } from "../../../application/contracts/deadline.js";

const network = (overrides: Partial<NetworkDescriptor> = {}): NetworkDescriptor =>
  ({
    id: "eip155:1",
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
      networkHttpConfig(network({ apiKeyHeader: "X-Provider-Key", apiKey: "header-secret" })),
    ).toEqual({
      endpoint: "https://rpc.example/v2/url-key",
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
    expect(networkHttpConfig(network(credentials)).headers).toEqual({});
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
      networkHttpConfig(network({ apiKeyHeader: "X-Provider-Key", apiKey: "header-secret" })),
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
      networkHttpConfig(network({ apiKeyHeader: "X-Provider-Key", apiKey: "network-secret" })),
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
      networkHttpConfig(network({ apiKeyHeader: "X-Provider-Key", apiKey: "header-secret" })),
      fetchFn,
    );

    await expect(
      transport.requestText({ method: "GET", path: "https://attacker.example/collect" }),
    ).rejects.toMatchObject({ name: "HttpTransportError", kind: "invalid_request" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("turns a non-success status into a safe typed error without exposing the response", async () => {
    const transport = new FetchHttpTransport(
      networkHttpConfig(network()),
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

  it("refuses to follow redirects whenever a network credential is attached", async () => {
    let init: RequestInit | undefined;
    const transport = new FetchHttpTransport(
      networkHttpConfig(network({ apiKeyHeader: "X-Provider-Key", apiKey: "header-secret" })),
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
    const transport = new FetchHttpTransport({ endpoint: "", headers: {} }, fetchFn);

    await expect(transport.requestText({ method: "POST", body: "{}" })).rejects.toMatchObject({
      name: "HttpTransportError",
      kind: "invalid_endpoint",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("FetchHttpTransport dispatch check", () => {
  it("never sends a request whose deadline has expired", async () => {
    const sent: string[] = [];
    const transport = new FetchHttpTransport(networkHttpConfig(network()), async (url, init) => {
      init?.signal?.throwIfAborted();
      sent.push(String(url));
      return new Response("ok");
    });

    await expect(
      withDispatchCheck(expiredCheck(), () => transport.requestText({ method: "GET" })),
    ).rejects.toBeInstanceOf(DeadlineExpiredError);
    expect(sent).toEqual([]);
  });

  it("aborts a sent request with the check's signal and reports timeout", async () => {
    const controller = new AbortController();
    const check = { signal: controller.signal, assertDispatchable: () => {} };
    const transport = new FetchHttpTransport(
      networkHttpConfig(network()),
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("secret network detail", "AbortError")),
          );
          controller.abort(new DeadlineExpiredError());
        }),
    );

    const error = await withDispatchCheck(check, () =>
      transport.requestText({ method: "GET" }),
    ).catch((e: unknown) => e);
    expect(error).toMatchObject({ name: "HttpTransportError", kind: "timeout" });
    expect(String(error)).not.toContain("secret network detail");
  });
});
