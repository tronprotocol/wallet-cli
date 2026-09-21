import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Wallet } from "ethers";
import { TronWeb, providers, utils as tronUtils } from "tronweb";
import { X402PaymentClient } from "./payment-client.js";
import { tronSignStrategy } from "../chain/tron/signing-strategy.js";
import type { TypedDataPayload } from "../../../domain/types/index.js";

beforeEach(() => {
  vi.spyOn(providers.HttpProvider.prototype, "request").mockImplementation(async (path) => {
    if (path === "wallet/triggerconstantcontract")
      return { result: { result: true }, constant_result: ["f".repeat(64)] };
    throw new Error(`Unexpected payer RPC ${path}`);
  });
});
afterEach(() => vi.restoreAllMocks());

it.each(["tron:3448148188", "tron:0xcd8690dc"])(
  "signs Nile %s through the existing TRON signer and SDK",
  async (wireNetwork) => {
    const key = Wallet.createRandom().privateKey;
    const address = TronWeb.address.fromPrivateKey(key.slice(2)) as string;
    const signTypedData = vi.fn((payload: TypedDataPayload) =>
      tronSignStrategy.signTypedData(key, payload),
    );
    const signers = {
      assertCanSign: vi.fn(),
      resolve: vi.fn(() => ({ kind: "software", address, signTypedData })),
    };
    const challenge = {
      x402Version: 2,
      resource: { url: "https://example.test/nile" },
      accepts: [
        {
          scheme: "exact",
          network: wireNetwork,
          amount: "1000000",
          asset: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
          payTo: "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ",
          maxTimeoutSeconds: 300,
          extra: { assetTransferMethod: "permit2" },
        },
      ],
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 402,
          headers: {
            "payment-required": Buffer.from(JSON.stringify(challenge)).toString("base64"),
          },
        }),
      )
      .mockResolvedValueOnce(new Response("ok"));
    const client = new X402PaymentClient(signers as never, fetcher);
    await expect(
      client.pay(
        { activeAccount: "nile-test", timeoutMs: 1000, emit: vi.fn() } as never,
        {
          id: "tron:3448148188",
          family: "tron",
          chainId: "3448148188",
          httpEndpoint: "http://127.0.0.1:1",
        } as never,
        {
          url: "https://example.test/nile",
          method: "GET",
          headers: [],
          token: "USDT",
          maxAmount: "1",
        },
      ),
    ).resolves.toMatchObject({ delivered: true, payer: { address } });
    expect(signers.resolve).toHaveBeenCalledWith("nile-test", "tron");
    expect(signTypedData).toHaveBeenCalledOnce();
    const payload = signTypedData.mock.calls[0]![0];
    const signed = await signTypedData.mock.results[0]!.value;
    expect(payload.domain.chainId).toBe(3448148188);
    expect(
      tronUtils.typedData
        .verifyTypedData(payload.domain, payload.types, payload.message, signed.signature)
        .toLowerCase(),
    ).toBe(`0x${TronWeb.address.toHex(address).slice(2)}`.toLowerCase());
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((fetcher.mock.calls[1]![0] as Request).headers.has("payment-signature")).toBe(true);
  },
);

it("uses the selected relay to construct and sign the final GasFree permit", async () => {
  const key = Wallet.createRandom().privateKey;
  const address = TronWeb.address.fromPrivateKey(key.slice(2)) as string;
  const payTo = "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ";
  const asset = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
  const signTypedData = vi.fn((payload: TypedDataPayload) =>
    tronSignStrategy.signTypedData(key, payload),
  );
  const signers = {
    assertCanSign: vi.fn(),
    resolve: () => ({ kind: "software", address, signTypedData }),
  };
  const warn = vi.fn();
  let endpointRequests = 0;
  const fetcher = vi.fn<typeof fetch>(async (request) => {
    const url =
      typeof request === "string"
        ? request
        : request instanceof URL
          ? request.toString()
          : request.url;
    if (url === "https://relay.example/nile/api/v1/config/provider/all")
      return Response.json({ code: 200, data: { providers: [{ address: payTo }] } });
    if (url === `https://relay.example/nile/api/v1/address/${address}`)
      return Response.json({
        code: 200,
        data: {
          gasFreeAddress: address,
          accountAddress: address,
          nonce: 0,
          active: true,
          allowSubmit: true,
          assets: [{ tokenAddress: asset, transferFee: "1300000", activateFee: "0", decimal: 6 }],
        },
      });
    expect(url).toBe("https://resource.example/paid");
    endpointRequests++;
    if (endpointRequests === 1)
      return new Response(null, {
        status: 402,
        headers: {
          "payment-required": Buffer.from(
            JSON.stringify({
              x402Version: 2,
              resource: { url },
              accepts: [
                {
                  scheme: "exact_gasfree",
                  network: "tron:3448148188",
                  amount: "10000",
                  asset,
                  payTo,
                  maxTimeoutSeconds: 300,
                  extra: {},
                },
              ],
            }),
          ).toString("base64"),
        },
      });
    return new Response("delivered");
  });
  const client = new X402PaymentClient(signers as never, fetcher);
  await expect(
    client.pay(
      { activeAccount: "test", timeoutMs: 1000, emit: vi.fn(), warn } as never,
      {
        id: "tron:3448148188",
        family: "tron",
        chainId: "3448148188",
        httpEndpoint: "http://127.0.0.1:1",
      } as never,
      {
        url: "https://resource.example/paid",
        method: "GET",
        headers: [],
        scheme: "exact_gasfree",
        gasfreeRelay: "https://relay.example/nile",
        maxRawAmount: "10000",
      },
    ),
  ).resolves.toMatchObject({ delivered: true });
  expect(signTypedData).toHaveBeenCalledOnce();
  expect(signTypedData.mock.calls[0]![0]).toMatchObject({
    primaryType: "PermitTransfer",
    message: { maxFee: 1300000n, value: 10000n },
  });
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("13000.00%"));
  expect(endpointRequests).toBe(2);
});
