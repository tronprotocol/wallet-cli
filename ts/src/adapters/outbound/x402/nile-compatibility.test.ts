import { expect, it, vi } from "vitest";
import { Wallet } from "ethers";
import { TronWeb, utils as tronUtils } from "tronweb";
import { X402PaymentClient } from "./payment-client.js";
import { tronSignStrategy } from "../chain/tron/signing-strategy.js";
import type { TypedDataPayload } from "../../../domain/types/index.js";

it("signs a Nile Permit2 payment through the existing TRON signing strategy and x402 SDK", async () => {
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
        network: "tron:0xcd8690dc",
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
        headers: { "payment-required": Buffer.from(JSON.stringify(challenge)).toString("base64") },
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
});
