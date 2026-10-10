import { describe, expect, it } from "vitest";
import { SunSwapRouterApi } from "./router-api.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { tronHexAddress } from "../../../domain/address/index.js";

const MAINNET = {
  id: "tron:728126428",
  family: "tron",
  chainId: "728126428",
  nativeSymbol: "TRX",
  capabilities: [],
  sunswap: { routerApiBaseUrl: "https://rot.endjgfsv.link" },
} as NetworkDescriptor;

const REQUEST = {
  fromToken: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
  toToken: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  amountInRaw: "1000000",
};

const OTHER_TOKEN = "TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR";

const ROUTE = {
  amountInRaw: REQUEST.amountInRaw,
  amountOutRaw: "343446",
  fee: "0.05",
  impact: "0",
  tokens: [REQUEST.fromToken, REQUEST.toToken],
  symbols: ["TRX", "USDT"],
  poolFees: ["3000", "0"],
  poolVersions: ["V2"],
  containsUnverifiedHook: false,
};

/**
 * The adapter over a fetch that answers with one canned response.
 *
 * Only the socket is replaced, so the adapter's own timeout, size cap and 429 interception run —
 * the wrapper these cases exist to check. Same seam as the market API's tests.
 */
function apiServing(response: () => Promise<Response> | Response, timeoutMs = 1_000) {
  return new SunSwapRouterApi(timeoutMs, {
    fetchImpl: (async () => response()) as typeof globalThis.fetch,
  });
}

function routeResponse(route: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ code: 0, data: [route] }), { status: 200 });
}

function evmHex(address: string): string {
  return `0x${tronHexAddress(address).slice(2)}`;
}

describe("SunSwapRouterApi request binding", () => {
  it("accepts a route whose endpoints and input amount match the request", async () => {
    const [route] = await apiServing(() => routeResponse(ROUTE)).routes(MAINNET, REQUEST);

    expect(route).toMatchObject({
      amountInRaw: REQUEST.amountInRaw,
      path: [{ address: REQUEST.fromToken }, { address: REQUEST.toToken }],
    });
  });

  it("accepts the SDK's equivalent 0x address representation", async () => {
    const route = {
      ...ROUTE,
      amountInRaw: `000${REQUEST.amountInRaw}`,
      tokens: [evmHex(REQUEST.fromToken), evmHex(REQUEST.toToken)],
    };

    await expect(
      apiServing(() => routeResponse(route)).routes(MAINNET, REQUEST),
    ).resolves.toHaveLength(1);
  });

  it("accepts the SDK's equivalent 41-prefixed address representation", async () => {
    const route = {
      ...ROUTE,
      tokens: [tronHexAddress(REQUEST.fromToken), tronHexAddress(REQUEST.toToken)],
    };

    await expect(
      apiServing(() => routeResponse(route)).routes(MAINNET, REQUEST),
    ).resolves.toHaveLength(1);
  });

  it("rejects a route for a different output token", async () => {
    const route = { ...ROUTE, tokens: [REQUEST.fromToken, OTHER_TOKEN] };

    await expect(
      apiServing(() => routeResponse(route)).routes(MAINNET, REQUEST),
    ).rejects.toMatchObject({ code: "provider_error" });
  });

  it("rejects a route for a different input token", async () => {
    const route = { ...ROUTE, tokens: [OTHER_TOKEN, REQUEST.toToken] };

    await expect(
      apiServing(() => routeResponse(route)).routes(MAINNET, REQUEST),
    ).rejects.toMatchObject({ code: "provider_error" });
  });

  it("rejects a route for a different input amount", async () => {
    const route = { ...ROUTE, amountInRaw: "999999" };

    await expect(
      apiServing(() => routeResponse(route)).routes(MAINNET, REQUEST),
    ).rejects.toMatchObject({ code: "provider_error" });
  });
});

describe("SunSwapRouterApi error mapping", () => {
  it("maps HTTP 429 to provider_rate_limited and carries Retry-After", async () => {
    const api = apiServing(
      () => new Response("slow down", { status: 429, headers: { "retry-after": "30" } }),
    );
    await expect(api.routes(MAINNET, REQUEST)).rejects.toMatchObject({
      code: "provider_rate_limited",
      message: "SunSwap route service rate limit exceeded",
      details: { httpStatus: 429, retryAfterSeconds: 30 },
    });
  });

  it("still reports the rate limit when no Retry-After was sent", async () => {
    const error = await apiServing(() => new Response("slow down", { status: 429 }))
      .routes(MAINNET, REQUEST)
      .catch((e) => e);
    expect(error.code).toBe("provider_rate_limited");
    expect(error.details).toEqual({ httpStatus: 429 });
  });

  it("honours the call's timeout", async () => {
    const stalling = ((_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      })) as typeof globalThis.fetch;
    const api = new SunSwapRouterApi(20, { fetchImpl: stalling });
    await expect(api.routes(MAINNET, REQUEST)).rejects.toMatchObject({ code: "timeout" });
  });

  it("refuses an oversized response as response_too_large", async () => {
    const api = apiServing(
      () =>
        new Response("{}", {
          status: 200,
          headers: { "content-length": String(64 * 1024 * 1024) },
        }),
    );
    await expect(api.routes(MAINNET, REQUEST)).rejects.toMatchObject({
      code: "response_too_large",
    });
  });

  it("maps another non-2xx to provider_error", async () => {
    const api = apiServing(() => new Response("upstream exploded", { status: 503 }));
    await expect(api.routes(MAINNET, REQUEST)).rejects.toMatchObject({
      code: "provider_error",
    });
  });

  it("maps a refusal in the envelope to provider_error", async () => {
    const api = apiServing(
      () => new Response(JSON.stringify({ code: 1, message: "INVALID AMOUNT" }), { status: 200 }),
    );
    await expect(api.routes(MAINNET, REQUEST)).rejects.toMatchObject({
      code: "provider_error",
      message: expect.stringContaining("INVALID AMOUNT"),
    });
  });
});
