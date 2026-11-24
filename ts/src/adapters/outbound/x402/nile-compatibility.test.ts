import { X402Service } from "../../../application/use-cases/x402-service.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Wallet } from "ethers";
import { TronWeb, providers, utils as tronUtils } from "tronweb";
import { X402PaymentClient } from "./payment-client.js";
import { tronSignStrategy } from "../chain/tron/signing-strategy.js";
import type { TypedDataPayload } from "../../../domain/types/index.js";
import { SigningService } from "../../../application/services/signing/signing-service.js";
import { evmTransactionChainId } from "../chain/evm/evm.js";
import { CommandDeadline } from "../../../application/services/command-deadline.js";

// Node answers the signing entry checks chain identity against.
const signing = new SigningService({
  get: () => ({
    referenceBlockStatus: async () => "held",
    transactionChainId: evmTransactionChainId,
  }),
} as never);

beforeEach(() => {
  vi.spyOn(providers.HttpProvider.prototype, "request").mockImplementation(async (path) => {
    if (path === "wallet/triggerconstantcontract")
      return { result: { result: true }, constant_result: ["f".repeat(64)] };
    throw new Error(`Unexpected payer RPC ${path}`);
  });
});
afterEach(() => vi.restoreAllMocks());

const nileUsdt = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
const mainnetUsdt = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const permit2 = { assetTransferMethod: "permit2" };

const exactQuotes = [
  {
    name: "decimal Nile quote",
    chainId: 3448148188,
    wireNetwork: "tron:3448148188",
    asset: nileUsdt,
    extra: permit2,
  },
  {
    name: "legacy hexadecimal Nile quote",
    chainId: 3448148188,
    wireNetwork: "tron:0xcd8690dc",
    asset: nileUsdt,
    extra: permit2,
  },
  {
    name: "mainnet USDT quote without extra",
    chainId: 728126428,
    wireNetwork: "tron:728126428",
    asset: mainnetUsdt,
    extra: undefined,
  },
  {
    name: "mainnet USDT quote with a domain and no method",
    chainId: 728126428,
    wireNetwork: "tron:728126428",
    asset: mainnetUsdt,
    extra: { name: "Tether USD", version: "1" },
  },
];

it.each(exactQuotes)(
  "sends a Permit2 payment for a $name",
  async ({ chainId, wireNetwork, asset, extra }) => {
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
      resource: { url: "https://example.test/paid" },
      accepts: [
        {
          scheme: "exact",
          network: wireNetwork,
          amount: "1000000",
          asset,
          payTo: "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ",
          maxTimeoutSeconds: 300,
          extra,
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
    const client = new X402Service(
      new X402PaymentClient(fetcher),
      signers as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      signing,
    );
    await expect(
      client.pay(
        { activeAccount: "test", deadline: new CommandDeadline(0), emit: vi.fn() } as never,
        {
          id: `tron:${chainId}`,
          family: "tron",
          chainId: String(chainId),
          httpEndpoint: "http://127.0.0.1:1",
        } as never,
        {
          url: challenge.resource.url,
          method: "GET",
          headers: [],
          token: "USDT",
          maxAmount: "1",
        },
      ),
    ).resolves.toMatchObject({ delivered: true, payer: { address } });
    expect(signers.resolve).toHaveBeenCalledWith("test", "tron");
    expect(signTypedData).toHaveBeenCalledOnce();
    const payload = signTypedData.mock.calls[0]![0];
    const signed = await signTypedData.mock.results[0]!.value;
    expect(payload).toMatchObject({
      primaryType: "PermitWitnessTransferFrom",
      domain: { name: "Permit2", chainId },
    });
    expect(
      tronUtils.typedData
        .verifyTypedData(payload.domain, payload.types, payload.message, signed.signature)
        .toLowerCase(),
    ).toBe(`0x${TronWeb.address.toHex(address).slice(2)}`.toLowerCase());
    expect(fetcher).toHaveBeenCalledTimes(2);
    const header = new Request(...fetcher.mock.calls[1]!).headers.get("payment-signature");
    expect(header).toBeTruthy();
    const payment = JSON.parse(Buffer.from(header!, "base64").toString("utf8"));
    expect(payment.accepted.network).toBe(wireNetwork);
    expect(payment.payload).toHaveProperty("permit2Authorization");
    expect(payment.payload).not.toHaveProperty("authorization");
  },
);

const gasFreeCaps = [undefined, "10000"];

it.each(gasFreeCaps)("signs the relay's GasFree permit with cap %s", async (cap) => {
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
  const client = new X402Service(
    new X402PaymentClient(fetcher),
    signers as never,
    {} as never,
    {} as never,
    undefined,
    undefined,
    signing,
  );
  await expect(
    client.pay(
      { activeAccount: "test", deadline: new CommandDeadline(0), emit: vi.fn(), warn } as never,
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
        maxRawAmount: cap,
        asset,
      },
    ),
  ).resolves.toMatchObject({ delivered: true });
  expect(signTypedData).toHaveBeenCalledOnce();
  expect(signTypedData.mock.calls[0]![0]).toMatchObject({
    primaryType: "PermitTransfer",
    message: { maxFee: 1300000n, value: 10000n },
  });
  expect(warn).toHaveBeenCalledWith(
    expect.objectContaining({ message: expect.stringContaining("13000.00%") }),
  );
  expect(endpointRequests).toBe(2);
});
