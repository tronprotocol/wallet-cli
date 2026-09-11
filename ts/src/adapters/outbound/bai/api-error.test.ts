import { describe, expect, it, vi } from "vitest";
import { BaiClient } from "./client.js";
import { BaiRechargeClient } from "./recharge-client.js";
import { baiApiError } from "./api-error.js";

const codes = [
  "WalletInvalidSignature",
  "UNSUPPORTED_CHAIN",
  "TX_NOT_FOUND_OR_INVALID",
  "UNSUPPORTED_TOKEN",
  "PAYER_MISMATCH",
  "WALLET_NOT_BOUND",
  "RECHARGE_TX_TOO_OLD",
  "TX_TIMESTAMP_UNAVAILABLE",
  "PRICE_UNAVAILABLE",
  "RECHARGE_AMOUNT_TOO_SMALL",
];
describe("B.AI failure diagnostics", () => {
  it.each(codes)("classifies %s in HTTP and tRPC failures", (reason) => {
    for (const status of [200, 400]) {
      const error = baiApiError(
        { error: { json: { message: reason, data: { code: "BAD_REQUEST" } } } },
        "wallet.bindRechargeWallet",
        status,
      );
      expect(error).toMatchObject({
        code: "bai_rejected",
        details: {
          reason,
          httpStatus: status,
          procedure: "wallet.bindRechargeWallet",
          retryPayment: false,
        },
      });
      expect(error!.message.length).toBeGreaterThan(30);
    }
  });
  it("maps the documented self-recipient rejection", () => {
    expect(
      baiApiError(
        { error: { json: { message: "请勿输入当前账号的邮箱或地址" } } },
        "order.resolveRechargeTarget",
        400,
      ),
    ).toMatchObject({ details: { reason: "SELF_RECHARGE_TARGET" } });
  });
  it.each([200, 400, 500])("redacts unknown server text at HTTP %s", (status) => {
    const error = baiApiError(
      { error: { json: { message: "secret-key-user-data", data: { code: "unknown-secret" } } } },
      "usage.summary",
      status,
    );
    expect(JSON.stringify(error?.toEnvelope())).not.toContain("secret");
    expect(error?.code).toBe("provider_error");
  });
  it.each(["query", "recharge"])(
    "maps bounded non-2xx JSON through the %s client",
    async (kind) => {
      const fetcher = vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { json: { message: "WalletInvalidSignature" } } }), {
            status: 400,
          }),
      );
      const call =
        kind === "query"
          ? new BaiClient({ baiApiKey: "secret" }, 1000, fetcher).status()
          : new BaiRechargeClient({ baiApiKey: "secret" }, 1000, fetcher).bind({
              chain: "tron",
              address: "payer",
              message: "m",
              signature: "s",
            });
      await expect(call).rejects.toMatchObject({
        code: "bai_rejected",
        details: { reason: "WalletInvalidSignature" },
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("preserves a report rejection explanation without server prose", async () => {
    const api = new BaiRechargeClient(
      { baiApiKey: "secret" },
      1000,
      async () =>
        new Response(
          JSON.stringify({ success: false, code: "PRICE_UNAVAILABLE", message: "secret" }),
        ),
    );
    await expect(api.reportTxHash({ chain: "tron", txHash: "hash" })).resolves.toMatchObject({
      success: false,
      code: "PRICE_UNAVAILABLE",
      message: expect.stringContaining("retry reporting later"),
    });
  });
  it("rejects invalid binding input before making a request", async () => {
    const fetcher = vi.fn();
    await expect(
      new BaiRechargeClient({ baiApiKey: "secret" }, 1000, fetcher).bind({
        chain: "tron",
        address: "payer",
        message: " ",
        signature: "s",
      }),
    ).rejects.toMatchObject({ code: "invalid_value", details: { fields: ["message"] } });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

it("bounds non-2xx error bodies instead of reading them without a limit", async () => {
  const cancel = vi.fn();
  const api = new BaiClient(
    { baiApiKey: "secret" },
    1000,
    async () =>
      new Response(
        new ReadableStream({
          pull(c) {
            c.enqueue(new Uint8Array(1024 * 1024));
          },
          cancel,
        }),
        { status: 400 },
      ),
  );
  await expect(api.status()).rejects.toMatchObject({ code: "response_too_large" });
  expect(cancel).toHaveBeenCalledOnce();
});
it("does not wait on an authentication error body", async () => {
  const cancel = vi.fn();
  const api = new BaiClient(
    { baiApiKey: "secret" },
    1000,
    async () => new Response(new ReadableStream({ pull() {}, cancel }), { status: 401 }),
  );
  await expect(api.status()).rejects.toMatchObject({ code: "bai_auth_failed" });
  expect(cancel).toHaveBeenCalledOnce();
});
