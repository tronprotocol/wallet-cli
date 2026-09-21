import { afterEach, describe, expect, it, vi } from "vitest";
import { Wallet, Interface } from "ethers";
import { TronWeb, providers, utils } from "tronweb";
import { X402PaymentClient } from "./payment-client.js";
import { tronSignStrategy } from "../chain/tron/signing-strategy.js";
import type { TypedDataPayload } from "../../../domain/types/index.js";
import { ChainError } from "../../../domain/errors/index.js";

afterEach(() => vi.restoreAllMocks());

it.each(["sufficient", "auto", "sponsored", "reverted"])(
  "handles TRON allowance through the installed SDK: %s",
  async (mode) => {
    const key = Wallet.createRandom().privateKey;
    const address = TronWeb.address.fromPrivateKey(key.slice(2)) as string;
    const calls: string[] = [];
    const sign = vi.fn(async (tx: unknown) => {
      calls.push("approve-sign");
      return tronSignStrategy.sign(key, tx);
    });
    const signTypedData = vi.fn(async (payload: TypedDataPayload) => {
      calls.push("payment-sign");
      return tronSignStrategy.signTypedData(key, payload);
    });
    const rpc = vi
      .spyOn(providers.HttpProvider.prototype, "request")
      .mockImplementation(async (path, data) => {
        const input = data as Record<string, any>;
        if (path === "wallet/triggerconstantcontract") {
          calls.push("allowance");
          return {
            result: { result: true },
            constant_result: [mode === "sufficient" ? "f".repeat(64) : "0".repeat(64)],
          };
        }
        if (path === "wallet/triggersmartcontract") {
          const decoded = new Interface(["function approve(address,uint256)"]).decodeFunctionData(
            "approve",
            `0x095ea7b3${input.parameter}`,
          );
          expect(decoded[1]).toBe((1n << 256n) - 1n);
          const shell = {
            visible: false,
            raw_data: {
              contract: [
                {
                  type: "TriggerSmartContract",
                  parameter: {
                    type_url: "type.googleapis.com/protocol.TriggerSmartContract",
                    value: {
                      owner_address: input.owner_address,
                      contract_address: input.contract_address,
                      data: `095ea7b3${input.parameter}`,
                      call_value: 0,
                    },
                  },
                },
              ],
              ref_block_bytes: "1234",
              ref_block_hash: "0011223344556677",
              timestamp: Date.now(),
              expiration: Date.now() + 60000,
              fee_limit: 100000000,
            },
          };
          const pb = utils.transaction.txJsonToPb(shell as never);
          return {
            result: { result: true },
            transaction: {
              ...shell,
              txID: utils.transaction.txPbToTxID(pb).replace(/^0x/, ""),
              raw_data_hex: utils.transaction.txPbToRawDataHex(pb).toLowerCase(),
            },
          };
        }
        if (path === "wallet/broadcasttransaction") {
          calls.push("approve-broadcast");
          expect(input.signature).toHaveLength(1);
          return { result: true, txid: input.txID };
        }
        if (path === "wallet/gettransactioninfobyid") {
          calls.push("approve-receipt");
          return {
            blockNumber: 1,
            receipt: { result: mode === "reverted" ? "REVERT" : "SUCCESS" },
          };
        }
        throw new Error(`Unexpected RPC ${path}`);
      });
    const extension = "trc20ApprovalResourceSponsoring";
    const challenge = {
      x402Version: 2,
      resource: { url: "https://payment.example" },
      accepts: [
        {
          network: "tron:0xcd8690dc",
          scheme: "exact",
          amount: "1000000",
          asset: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
          payTo: "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ",
          maxTimeoutSeconds: 300,
          extra: { assetTransferMethod: "permit2" },
        },
      ],
      ...(mode === "sponsored" ? { extensions: { [extension]: { info: { version: "1" } } } } : {}),
    };
    let payload: any;
    const fetcher = vi.fn<typeof fetch>(async (request, init) => {
      const req = new Request(request, init);
      const signature = req.headers.get("payment-signature");
      if (!signature)
        return Response.json(challenge, {
          status: 402,
          headers: {
            "payment-required": Buffer.from(JSON.stringify(challenge)).toString("base64"),
          },
        });
      calls.push("payment-send");
      payload = JSON.parse(Buffer.from(signature, "base64").toString());
      return new Response("ok");
    });
    const client = new X402PaymentClient(
      {
        assertCanSign() {},
        resolve: () => ({
          kind: "software",
          address,
          sign,
          signTypedData,
        }),
      } as never,
      fetcher,
    );
    const payment = client.pay(
      { activeAccount: "payer", timeoutMs: 1000, emit() {}, warn() {} } as never,
      {
        id: "tron:3448148188",
        chainId: "3448148188",
        family: "tron",
        httpEndpoint: "http://127.0.0.1:1",
      } as never,
      { url: "https://payment.example", method: "GET", headers: [], token: "USDT", maxAmount: "1" },
    );
    if (mode === "reverted") {
      await expect(payment).rejects.toMatchObject({ code: "provider_error" });
      expect(signTypedData).not.toHaveBeenCalled();
      expect(fetcher).toHaveBeenCalledOnce();
    } else {
      await expect(payment).resolves.toMatchObject({ delivered: true });
      if (mode === "sufficient") expect(sign).not.toHaveBeenCalled();
      else expect(sign).toHaveBeenCalledOnce();
      if (mode === "auto")
        expect(calls).toEqual([
          "allowance",
          "approve-sign",
          "approve-broadcast",
          "approve-receipt",
          "payment-sign",
          "payment-send",
        ]);
      if (mode === "sponsored") {
        expect(calls).not.toContain("approve-broadcast");
        expect(payload.extensions[extension].info.signedTransaction).toBeTruthy();
      }
    }
    expect(rpc).toHaveBeenCalled();
  },
);

/**
 * The approve above is built by the RPC, not locally. A compromised RPC can answer the SDK's
 * approve request with a different, self-consistent transaction (owner-only types need nothing
 * but our address): txID, raw_data_hex and raw_data all agree, so the integrity check passes
 * and — before this guard — the wallet signed and the SDK broadcast (auto) or exported
 * (sponsored) it. The bridge must refuse before the signer sees it.
 */
it.each([
  ["auto", "WithdrawBalanceContract"],
  ["sponsored", "WithdrawBalanceContract"],
  ["auto", "CancelAllUnfreezeV2Contract"],
])("refuses an RPC-substituted %s approve (%s) before signing", async (mode, type) => {
  const key = Wallet.createRandom().privateKey;
  const address = TronWeb.address.fromPrivateKey(key.slice(2)) as string;
  const calls: string[] = [];
  const sign = vi.fn(async (tx: unknown) => {
    calls.push("approve-sign");
    return tronSignStrategy.sign(key, tx);
  });
  const signTypedData = vi.fn(async (payload: TypedDataPayload) => {
    calls.push("payment-sign");
    return tronSignStrategy.signTypedData(key, payload);
  });
  vi.spyOn(providers.HttpProvider.prototype, "request").mockImplementation(async (path, data) => {
    const input = data as Record<string, any>;
    if (path === "wallet/triggerconstantcontract")
      return { result: { result: true }, constant_result: ["0".repeat(64)] };
    if (path === "wallet/triggersmartcontract") {
      const shell = {
        visible: false,
        raw_data: {
          contract: [
            {
              type,
              parameter: {
                type_url: `type.googleapis.com/protocol.${type}`,
                value: { owner_address: input.owner_address },
              },
            },
          ],
          ref_block_bytes: "1234",
          ref_block_hash: "0011223344556677",
          timestamp: Date.now(),
          expiration: Date.now() + 60000,
          fee_limit: 100000000,
        },
      };
      const pb = utils.transaction.txJsonToPb(shell as never);
      return {
        result: { result: true },
        transaction: {
          ...shell,
          txID: utils.transaction.txPbToTxID(pb).replace(/^0x/, ""),
          raw_data_hex: utils.transaction.txPbToRawDataHex(pb).toLowerCase(),
        },
      };
    }
    if (path === "wallet/broadcasttransaction") {
      calls.push("approve-broadcast");
      return { result: true, txid: input.txID };
    }
    throw new Error(`Unexpected RPC ${path}`);
  });
  const extension = "trc20ApprovalResourceSponsoring";
  const challenge = {
    x402Version: 2,
    resource: { url: "https://payment.example" },
    accepts: [
      {
        network: "tron:0xcd8690dc",
        scheme: "exact",
        amount: "1000000",
        asset: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
        payTo: "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      },
    ],
    ...(mode === "sponsored" ? { extensions: { [extension]: { info: { version: "1" } } } } : {}),
  };
  const fetcher = vi.fn<typeof fetch>(async (request, init) => {
    const req = new Request(request, init);
    if (!req.headers.get("payment-signature"))
      return Response.json(challenge, {
        status: 402,
        headers: { "payment-required": Buffer.from(JSON.stringify(challenge)).toString("base64") },
      });
    calls.push("payment-send");
    return new Response("ok");
  });
  const client = new X402PaymentClient(
    {
      assertCanSign() {},
      resolve: () => ({ kind: "software", address, sign, signTypedData }),
    } as never,
    fetcher,
  );
  const error = await client
    .pay(
      { activeAccount: "payer", timeoutMs: 1000, emit() {}, warn() {} } as never,
      {
        id: "tron:3448148188",
        chainId: "3448148188",
        family: "tron",
        httpEndpoint: "http://127.0.0.1:1",
      } as never,
      { url: "https://payment.example", method: "GET", headers: [], token: "USDT", maxAmount: "1" },
    )
    .catch((e) => e);
  expect(error).toMatchObject({
    code: "signed_payload_mismatch",
    details: { retryPayment: false },
  });
  // The sponsored flow has the SDK sign the payment authorization before it builds the approve;
  // that signature never leaves the process. The auto flow fails before any signature at all.
  if (mode === "auto") {
    expect(error).toMatchObject({ details: { paymentStatus: "not_sent" } });
    expect(calls).toEqual([]);
  } else {
    expect(calls).toEqual(["payment-sign"]);
  }
  expect(sign).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledOnce();
});

/**
 * The auto approve is a real, irreversible side effect (an unlimited allowance, broadcast and
 * confirmed by the SDK) that happens BEFORE the payment authorization is signed. When anything
 * after it fails — a device rejection, an expired deadline, a settlement error — the caller must
 * still get that approval's evidence, and must not be told the payment is "unknown" when no
 * payment authorization was ever produced.
 */
describe("x402 TRON auto approve keeps its evidence", () => {
  const PERMIT2_NILE = "TYQuuhGbEMxF7nZxUHV3uHJxAVVAegNU9h";
  const USDT_NILE = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
  function harness(mode: "auto" | "sponsored") {
    const key = Wallet.createRandom().privateKey;
    const address = TronWeb.address.fromPrivateKey(key.slice(2)) as string;
    const broadcast: string[] = [];
    const rpc = vi
      .spyOn(providers.HttpProvider.prototype, "request")
      .mockImplementation(async (path, data) => {
        const input = data as Record<string, any>;
        if (path === "wallet/triggerconstantcontract")
          return { result: { result: true }, constant_result: ["0".repeat(64)] };
        if (path === "wallet/triggersmartcontract") {
          const shell = {
            visible: false,
            raw_data: {
              contract: [
                {
                  type: "TriggerSmartContract",
                  parameter: {
                    type_url: "type.googleapis.com/protocol.TriggerSmartContract",
                    value: {
                      owner_address: input.owner_address,
                      contract_address: input.contract_address,
                      data: `095ea7b3${input.parameter}`,
                      call_value: 0,
                    },
                  },
                },
              ],
              ref_block_bytes: "1234",
              ref_block_hash: "0011223344556677",
              timestamp: Date.now(),
              expiration: Date.now() + 60000,
              fee_limit: 100000000,
            },
          };
          const pb = utils.transaction.txJsonToPb(shell as never);
          return {
            result: { result: true },
            transaction: {
              ...shell,
              txID: utils.transaction.txPbToTxID(pb).replace(/^0x/, ""),
              raw_data_hex: utils.transaction.txPbToRawDataHex(pb).toLowerCase(),
            },
          };
        }
        if (path === "wallet/broadcasttransaction") {
          broadcast.push(input.txID);
          return { result: true, txid: input.txID };
        }
        if (path === "wallet/gettransactioninfobyid")
          return { blockNumber: 1, receipt: { result: "SUCCESS" } };
        throw new Error(`Unexpected RPC ${path}`);
      });
    const extension = "trc20ApprovalResourceSponsoring";
    const challenge = {
      x402Version: 2,
      resource: { url: "https://payment.example" },
      accepts: [
        {
          network: "tron:0xcd8690dc",
          scheme: "exact",
          amount: "1000000",
          asset: USDT_NILE,
          payTo: "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ",
          maxTimeoutSeconds: 300,
          extra: { assetTransferMethod: "permit2" },
        },
      ],
      ...(mode === "sponsored" ? { extensions: { [extension]: { info: { version: "1" } } } } : {}),
    };
    return { key, address, broadcast, rpc, challenge };
  }
  const net = {
    id: "tron:3448148188",
    chainId: "3448148188",
    family: "tron",
    httpEndpoint: "http://127.0.0.1:1",
  } as never;
  const input = {
    url: "https://payment.example",
    method: "GET",
    headers: [] as string[],
    token: "USDT",
    maxAmount: "1",
  };

  it("reports the confirmed approval and a not-sent payment when the payment signature is refused", async () => {
    const { key, address, broadcast, challenge } = harness("auto");
    const warnings: string[] = [];
    const sign = vi.fn(async (tx: unknown) => tronSignStrategy.sign(key, tx));
    const signTypedData = vi.fn(async () => {
      throw new ChainError("signing_rejected", "declined on device");
    });
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(challenge, {
        status: 402,
        headers: { "payment-required": Buffer.from(JSON.stringify(challenge)).toString("base64") },
      }),
    );
    const client = new X402PaymentClient(
      {
        assertCanSign() {},
        resolve: () => ({ kind: "software", address, sign, signTypedData }),
      } as never,
      fetcher,
    );
    const error = await client
      .pay(
        {
          activeAccount: "payer",
          timeoutMs: 1000,
          emit() {},
          warn: (m: string) => warnings.push(m),
        } as never,
        net,
        input,
      )
      .catch((e) => e);
    expect(broadcast).toHaveLength(1);
    expect(error).toMatchObject({
      code: "signing_rejected",
      details: {
        paymentStatus: "not_sent",
        retryPayment: false,
        approval: {
          txId: broadcast[0],
          token: USDT_NILE,
          spender: PERMIT2_NILE,
          allowance: "unlimited",
          status: "confirmed",
        },
      },
    });
    expect(warnings.some((w) => w.includes(broadcast[0]!))).toBe(true);
  });

  it("includes the approval in a successful payment result", async () => {
    const { key, address, broadcast, challenge } = harness("auto");
    const sign = vi.fn(async (tx: unknown) => tronSignStrategy.sign(key, tx));
    const signTypedData = vi.fn(async (p: TypedDataPayload) =>
      tronSignStrategy.signTypedData(key, p),
    );
    const fetcher = vi.fn<typeof fetch>(async (request, init) => {
      const req = new Request(request, init);
      if (!req.headers.get("payment-signature"))
        return Response.json(challenge, {
          status: 402,
          headers: {
            "payment-required": Buffer.from(JSON.stringify(challenge)).toString("base64"),
          },
        });
      return new Response("ok");
    });
    const client = new X402PaymentClient(
      {
        assertCanSign() {},
        resolve: () => ({ kind: "software", address, sign, signTypedData }),
      } as never,
      fetcher,
    );
    const result = await client.pay(
      { activeAccount: "payer", timeoutMs: 1000, emit() {}, warn() {} } as never,
      net,
      input,
    );
    expect(broadcast).toHaveLength(1);
    expect(result).toMatchObject({
      delivered: true,
      approval: {
        txId: broadcast[0],
        token: USDT_NILE,
        spender: PERMIT2_NILE,
        status: "confirmed",
      },
    });
  });

  it("marks a sponsored approval as exported when the payment request then fails", async () => {
    const { key, address, broadcast, challenge } = harness("sponsored");
    const sign = vi.fn(async (tx: unknown) => tronSignStrategy.sign(key, tx));
    const signTypedData = vi.fn(async (p: TypedDataPayload) =>
      tronSignStrategy.signTypedData(key, p),
    );
    const fetcher = vi.fn<typeof fetch>(async (request, init) => {
      const req = new Request(request, init);
      if (!req.headers.get("payment-signature"))
        return Response.json(challenge, {
          status: 402,
          headers: {
            "payment-required": Buffer.from(JSON.stringify(challenge)).toString("base64"),
          },
        });
      return new Response("boom", { status: 500 });
    });
    const client = new X402PaymentClient(
      {
        assertCanSign() {},
        resolve: () => ({ kind: "software", address, sign, signTypedData }),
      } as never,
      fetcher,
    );
    const error = await client
      .pay({ activeAccount: "payer", timeoutMs: 1000, emit() {}, warn() {} } as never, net, input)
      .catch((e) => e);
    expect(broadcast).toHaveLength(0);
    expect(error).toMatchObject({
      details: { approval: { token: USDT_NILE, spender: PERMIT2_NILE, status: "exported" } },
    });
    expect(error.details.approval.txId).toMatch(/^[0-9a-f]{64}$/);
  });
});

it("reports the SDK's default $1 ceiling as amount_exceeds_limit before anything is signed", async () => {
  const key = Wallet.createRandom().privateKey;
  const address = TronWeb.address.fromPrivateKey(key.slice(2)) as string;
  const rpc = vi.spyOn(providers.HttpProvider.prototype, "request");
  const sign = vi.fn();
  const signTypedData = vi.fn();
  const challenge = {
    x402Version: 2,
    resource: { url: "https://payment.example" },
    accepts: [
      {
        network: "tron:0xcd8690dc",
        scheme: "exact",
        amount: "2000000",
        asset: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
        payTo: "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      },
    ],
  };
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json(challenge, {
      status: 402,
      headers: { "payment-required": Buffer.from(JSON.stringify(challenge)).toString("base64") },
    }),
  );
  const client = new X402PaymentClient(
    {
      assertCanSign() {},
      resolve: () => ({ kind: "software", address, sign, signTypedData }),
    } as never,
    fetcher,
  );
  await expect(
    client.pay(
      { activeAccount: "payer", timeoutMs: 1000, emit() {}, warn() {} } as never,
      {
        id: "tron:3448148188",
        chainId: "3448148188",
        family: "tron",
        httpEndpoint: "http://127.0.0.1:1",
      } as never,
      { url: "https://payment.example", method: "GET", headers: [], token: "USDT" },
    ),
  ).rejects.toMatchObject({
    code: "amount_exceeds_limit",
    details: { paymentStatus: "not_sent", retryPayment: false },
  });
  expect(sign).not.toHaveBeenCalled();
  expect(signTypedData).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledOnce();
});
