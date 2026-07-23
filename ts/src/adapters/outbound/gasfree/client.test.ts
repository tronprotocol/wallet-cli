import { describe, expect, it, vi } from "vitest";
import type {
  Config,
  NetworkDescriptor,
} from "../../../domain/types/index.js";
import { GasFreeClient } from "./client.js";

const NETWORK = {
  id: "tron:nile",
  family: "tron",
  chainId: "nile",
  aliases: ["nile"],
  capabilities: [],
  gasfree: {
    baseUrl: "https://open-test.gasfree.io",
    apiPrefix: "/nile",
    controllerChainId: "3448148188",
    verifyingContract: "THQGuFzL87ZqhxkgqYEryRAd7gqFqL5rdc",
  },
} satisfies NetworkDescriptor;
const CONFIG = {
  gasfreeApiKey: "test-key",
  gasfreeApiSecret: "test-secret",
} as Config;

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("GasFreeClient", () => {
  it("signs the exact Java path and parses uints losslessly", async () => {
    const fetcher = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        expect(init?.headers).toMatchObject({
          Timestamp: "1700000000",
          Authorization:
            "ApiKey test-key:0nyrTDAIARSlT+WxH69ILaVpOZ7UTkEBwEH8uxR5B2I=",
        });
        return new Response(
          '{"code":200,"data":{"tokens":[{"tokenAddress":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","activateFee":900719925474099312345,"transferFee":2000,"symbol":"USDT","decimals":6}]}}',
          { status: 200 },
        );
      },
    );
    const client = new GasFreeClient(
      CONFIG,
      1000,
      fetcher as typeof fetch,
      () => 1_700_000_000_000,
    );
    const tokens = await client.listTokens(NETWORK);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://open-test.gasfree.io/nile/api/v1/config/token/all",
    );
    expect(tokens[0]?.activateFee).toBe("900719925474099312345");
  });

  it("serializes uint256 values as JSON numbers and never retries POST", async () => {
    const fetcher = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        expect(init?.body).toContain('"value":900719925474099312345');
        return response({
          code: 200,
          data: {
            id: "6c3ff67e-0bf4-4c09-91ca-0c7c254b01a0",
            state: "WAITING",
            tokenAddress: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
            providerAddress: "TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E",
            accountAddress: "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC",
            gasFreeAddress: "TNER12mMVWruqopsW9FQtKxCGfZcEtb3ER",
            targetAddress: "TEkj3ndMVEmFLYaFrATMwMjBRZ1EAZkucT",
            amount: 900719925474099312345n.toString(),
            maxFee: 2000000,
            nonce: 8,
            expiredAt: 1747909695000,
          },
        });
      },
    );
    const client = new GasFreeClient(
      CONFIG,
      1000,
      fetcher as typeof fetch,
      () => 1_700_000_000_000,
    );
    const record = await client.submitTransfer(NETWORK, {
      token: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
      serviceProvider: "TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E",
      user: "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC",
      receiver: "TEkj3ndMVEmFLYaFrATMwMjBRZ1EAZkucT",
      value: "900719925474099312345",
      maxFee: "2000000",
      deadline: "1747909695",
      version: "1",
      nonce: "8",
      sig: "00".repeat(64) + "1b",
    });
    expect(record.expiredAt).toBe("1747909695000");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("maps authentication errors without leaking credentials", async () => {
    const client = new GasFreeClient(
      CONFIG,
      1000,
      vi.fn(async () => response({}, 401)) as typeof fetch,
    );
    await expect(client.listTokens(NETWORK)).rejects.toMatchObject({
      code: "gasfree_auth_failed",
    });
    await expect(client.listTokens(NETWORK)).rejects.not.toThrow(
      /test-secret|test-key/,
    );
  });

  it("rejects unsupported networks before sending credentials", async () => {
    const fetcher = vi.fn();
    const client = new GasFreeClient(CONFIG, 1000, fetcher as typeof fetch);
    await expect(
      client.listTokens({ ...NETWORK, gasfree: undefined }),
    ).rejects.toMatchObject({ code: "unsupported_network" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
