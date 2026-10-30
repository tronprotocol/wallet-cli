import { afterEach, describe, expect, it, vi } from "vitest";
import { TronGridHistoryReader } from "./history-reader.js";
import { ERROR_CODES } from "../../../../domain/errors/codes.js";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";

const network = { httpEndpoint: "http://localhost:1" } as NetworkDescriptor;

afterEach(() => vi.unstubAllGlobals());

function nodeAnswers(status: number, body = "{}") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, { status })),
  );
}

const read = () => new TronGridHistoryReader(50).get(network, "TXaddr", { limit: 20 });

describe("TronGridHistoryReader failures", () => {
  it.each([
    [503, "rpc_error", "same"],
    [500, "rpc_error", "same"],
    [429, "provider_rate_limited", "later"],
    [404, "history_not_supported", "never"],
  ] as const)("HTTP %i → %s", async (status, code, retry) => {
    nodeAnswers(status);
    await expect(read()).rejects.toMatchObject({ code });
    expect(ERROR_CODES[code].retry).toBe(retry);
  });

  it("reports a timeout as timeout", async () => {
    vi.stubGlobal(
      "fetch",
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "TimeoutError")),
          );
        }),
    );
    await expect(read()).rejects.toMatchObject({ code: "timeout" });
  });

  it("reports a network failure as rpc_error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(read()).rejects.toMatchObject({ code: "rpc_error" });
  });

  it.each(["not json", "null", '{"data": {}}', '{"success": true}', '{"data": null}'])(
    "reports a malformed body %j as invalid_node_response",
    async (body) => {
      nodeAnswers(200, body);
      await expect(read()).rejects.toMatchObject({ code: "invalid_node_response" });
    },
  );

  it("reports a network without an endpoint as history_not_supported", async () => {
    await expect(
      new TronGridHistoryReader().get({} as NetworkDescriptor, "TXaddr", { limit: 20 }),
    ).rejects.toMatchObject({ code: "history_not_supported" });
  });

  it("reads an empty page", async () => {
    nodeAnswers(200, '{"data": []}');
    await expect(read()).resolves.toMatchObject({ count: 0, records: [] });
  });
});
