import { describe, expect, it, vi } from "vitest";
import { BaiRechargeClient } from "./recharge-client.js";
const target = {
  input: { type: "personal" as const, identifier: "recipient@example.com" },
  confirmedTarget: { type: "personal" as const, targetId: "recipient-id" },
};
function fixture(payload: unknown) {
  const fetcher = vi.fn(
    async (_url: string, _init: RequestInit) => new Response(JSON.stringify(payload)),
  );
  return {
    fetcher,
    client: new BaiRechargeClient(
      { baiApiKey: "secret" },
      1000,
      fetcher as typeof fetch,
      "https://bai.example",
    ),
  };
}
describe("B.AI recharge API", () => {
  it("checks binding without treating the boolean as a recipient ID", async () => {
    const { client, fetcher } = fixture({ result: { data: { json: true } } });
    await expect(client.isBound({ address: "payer", chain: "bnb" })).resolves.toBe(true);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(new URL(url).pathname).toBe("/trpc/lambda/wallet.isRechargeBound");
    expect(JSON.parse(new URL(url).searchParams.get("input")!)).toEqual({
      json: { address: "payer", chain: "bnb" },
    });
    expect(init).toMatchObject({ method: "GET", redirect: "error" });
  });
  it("binds the payer with a supplied signed message", async () => {
    const { client, fetcher } = fixture({
      success: true,
      binding: { userId: "payer-id", address: "payer", chain: "bnb" },
    });
    const input = {
      address: "payer",
      chain: "bnb",
      message: "documented message",
      signature: "signature",
      version: 2,
    };
    await expect(client.bind(input)).resolves.toEqual({
      userId: "payer-id",
      address: "payer",
      chain: "bnb",
    });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toContain("/wallet.bindRechargeWallet");
    expect(init.headers).toMatchObject({ Authorization: "Bearer secret" });
    expect(JSON.parse(init.body as string)).toEqual({ json: input });
  });
  it("creates a preorder carrying the exact payer and confirmed recipient", async () => {
    const { client, fetcher } = fixture({ result: { data: { json: { orderId: 123 } } } });
    const input = {
      channel: "crypto" as const,
      chain: "bnb",
      tokenName: "USDT",
      amount: 10,
      walletAddress: "payer",
      deviceType: "web" as const,
      rechargeTarget: target,
    };
    await expect(client.createOrder(input)).resolves.toEqual({ orderId: 123 });
    expect(JSON.parse(fetcher.mock.calls[0]![1].body as string)).toEqual({ json: input });
  });
  it("reports the paid transaction and preserves credited order data", async () => {
    const order = { id: 12345, status: "success", points: 100000 };
    const { client, fetcher } = fixture({ success: true, order });
    const input = { chain: "bnb", txHash: "hash", rechargeTarget: target };
    await expect(client.reportTxHash(input)).resolves.toEqual({ success: true, order });
    expect(JSON.parse(fetcher.mock.calls[0]![1].body as string)).toEqual({ json: input });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(["PAYER_MISMATCH", "TX_NOT_FOUND_OR_INVALID", "WALLET_NOT_BOUND"])(
    "preserves %s without exposing server details or retrying",
    async (code) => {
      const { client, fetcher } = fixture({ success: false, code, message: "secret" });
      await expect(
        client.reportTxHash({ chain: "bnb", txHash: "hash", rechargeTarget: target }),
      ).resolves.toEqual({ success: false, code });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("rejects a mismatched payer binding", async () => {
    const { client } = fixture({
      success: true,
      binding: { userId: "id", address: "different", chain: "bnb" },
    });
    await expect(
      client.bind({ address: "payer", chain: "bnb", message: "m", signature: "s" }),
    ).rejects.toMatchObject({ code: "provider_error" });
  });
  it.each([{}, { success: true }, { result: { data: { json: "true" } } }])(
    "rejects malformed binding status",
    async (payload) => {
      await expect(
        fixture(payload).client.isBound({ address: "payer", chain: "bnb" }),
      ).rejects.toMatchObject({ code: "provider_error" });
    },
  );
  it("rejects missing credentials before HTTP", async () => {
    const fetcher = vi.fn();
    await expect(
      new BaiRechargeClient({}, 1000, fetcher).isBound({ address: "payer", chain: "bnb" }),
    ).rejects.toMatchObject({ code: "bai_credentials_missing" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

it.each([
  [401, "bai_auth_failed"],
  [403, "bai_auth_failed"],
  [429, "provider_rate_limited"],
  [500, "provider_error"],
])("classifies HTTP %s without exposing response details", async (status, code) => {
  const fetcher = vi.fn(async () => new Response("secret", { status: Number(status) }));
  await expect(
    new BaiRechargeClient({ baiApiKey: "secret" }, 1000, fetcher).isBound({
      address: "payer",
      chain: "bnb",
    }),
  ).rejects.toMatchObject({ code, message: expect.not.stringContaining("secret") });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("does not follow credential-bearing mutation redirects", async () => {
  const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    expect(init?.redirect).toBe("error");
    throw new TypeError("redirect to secret");
  });
  await expect(
    new BaiRechargeClient({ baiApiKey: "secret" }, 1000, fetcher).bind({
      address: "payer",
      chain: "bnb",
      message: "m",
      signature: "s",
    }),
  ).rejects.toMatchObject({
    code: "provider_error",
    message: expect.not.stringContaining("secret"),
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("refuses malformed or missing credited order results", async () => {
  await expect(
    fixture({ success: true }).client.reportTxHash({
      chain: "bnb",
      txHash: "hash",
      rechargeTarget: target,
    }),
  ).rejects.toMatchObject({ code: "provider_error" });
});

it("resolves a recipient through the documented endpoint before constructing a target", async () => {
  const { client, fetcher } = fixture({
    result: {
      data: {
        json: { type: "personal", targetId: "recipient-id", displayLabel: "recipient@example.com" },
      },
    },
  });
  await expect(client.resolveTarget("recipient@example.com")).resolves.toEqual({
    type: "personal",
    targetId: "recipient-id",
    displayLabel: "recipient@example.com",
  });
  expect(fetcher.mock.calls[0]![0]).toContain("/order.resolveRechargeTarget");
  expect(JSON.parse(fetcher.mock.calls[0]![1].body as string)).toEqual({
    json: { type: "personal", identifier: "recipient@example.com" },
  });
});
it("rejects an unresolved or wrong-type recipient", async () => {
  for (const payload of [
    { type: "personal" },
    { type: "organization", targetId: "id", displayLabel: "label" },
  ]) {
    await expect(
      fixture({ result: { data: { json: payload } } }).client.resolveTarget("recipient"),
    ).rejects.toMatchObject({ code: "provider_error" });
  }
});
it("rejects an empty preorder response before the caller can pay", async () => {
  await expect(
    fixture({}).client.createOrder({
      channel: "crypto",
      chain: "bnb",
      tokenName: "USDT",
      amount: 10,
      walletAddress: "payer",
      deviceType: "web",
      rechargeTarget: target,
    }),
  ).rejects.toMatchObject({ code: "provider_error" });
});
