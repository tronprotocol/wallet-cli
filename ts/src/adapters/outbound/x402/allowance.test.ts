import { X402Service } from "../../../application/use-cases/x402-service.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Wallet, Interface } from "ethers";
import { TronWeb, providers, utils } from "tronweb";
import { X402PaymentClient } from "./payment-client.js";
import { tronSignStrategy } from "../chain/tron/signing-strategy.js";
import type { TypedDataPayload, UnsignedTx } from "../../../domain/types/index.js";
import { ChainError } from "../../../domain/errors/index.js";
import type { Permit2ApproveRequest } from "../../../application/contracts/x402-payer.js";
import { SigningService } from "../../../application/services/signing/signing-service.js";
import { evmTransactionChainId } from "../chain/evm/evm.js";
import { exitCodeOf } from "../../inbound/cli/output/errors.js";

// Node answers the signing entry checks chain identity against.
const signing = new SigningService({
  get: () => ({
    referenceBlockStatus: async () => "held",
    transactionChainId: evmTransactionChainId,
  }),
} as never);

afterEach(() => vi.restoreAllMocks());

const APPROVAL_TX = "cd".repeat(32);

// Stands in for the application's TxPipeline approval; `granted` lets the RPC mock report the new allowance.
function fakeApprovals(fail?: Error) {
  const requests: Permit2ApproveRequest[] = [];
  const state = { granted: false };
  const approvals = {
    approver: () => ({
      approve: async (request: Permit2ApproveRequest) => {
        requests.push(request);
        if (fail) throw fail;
        state.granted = true;
        return {
          txId: APPROVAL_TX,
          token: request.token,
          spender: request.spender,
          allowance: "unlimited" as const,
          feeLimitSun: 100_000_000,
        };
      },
    }),
  };
  return { requests, state, approvals };
}

it.each(["sufficient", "auto", "sponsored", "reverted"])(
  "handles TRON allowance through the installed SDK: %s",
  async (mode) => {
    const fake = fakeApprovals(
      mode === "reverted"
        ? new ChainError("execution_reverted", "the Permit2 approval failed on chain", {
            txId: APPROVAL_TX,
          })
        : undefined,
    );
    const key = Wallet.createRandom().privateKey;
    const address = TronWeb.address.fromPrivateKey(key.slice(2)) as string;
    const calls: string[] = [];
    const sign = vi.fn(async (tx: UnsignedTx) => {
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
            constant_result: [
              mode === "sufficient" || fake.state.granted ? "f".repeat(64) : "0".repeat(64),
            ],
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
    const client = new X402Service(
      new X402PaymentClient(fetcher),
      {
        assertCanSign() {},
        resolve: () => ({
          kind: "software",
          address,
          sign,
          signTypedData,
        }),
      } as never,
      {} as never,
      {} as never,
      undefined,
      fake.approvals,
      signing,
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
    // The SDK never broadcasts; a missing allowance goes to the application's approval path.
    if (mode === "reverted") {
      await expect(payment).rejects.toMatchObject({
        code: "execution_reverted",
        details: { txId: APPROVAL_TX, paymentStatus: "not_sent", retryPayment: false },
      });
      expect(signTypedData).not.toHaveBeenCalled();
      expect(fetcher).toHaveBeenCalledOnce();
    } else {
      await expect(payment).resolves.toMatchObject({ delivered: true });
      if (mode === "sponsored") expect(sign).toHaveBeenCalledOnce();
      else expect(sign).not.toHaveBeenCalled();
      if (mode === "auto") {
        expect(calls).toEqual(["allowance", "payment-sign", "payment-send"]);
        expect(fake.requests).toEqual([
          {
            token: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
            spender: "TYQuuhGbEMxF7nZxUHV3uHJxAVVAegNU9h",
            requiredAllowance: "1000000",
            readAllowance: expect.any(Function),
          },
        ]);
      }
      if (mode === "sponsored") {
        expect(payload.extensions[extension].info.signedTransaction).toBeTruthy();
      }
    }
    if (mode !== "sponsored") expect(fake.requests).toHaveLength(mode === "sufficient" ? 0 : 1);
    expect(calls).not.toContain("approve-broadcast");
    expect(rpc).toHaveBeenCalled();
  },
);

// The substituted transaction has consistent txID, raw_data_hex and raw_data.
it.each([
  ["sponsored", "WithdrawBalanceContract"],
  ["sponsored", "CancelAllUnfreezeV2Contract"],
])("refuses an RPC-substituted %s approve (%s) before signing", async (mode, type) => {
  const key = Wallet.createRandom().privateKey;
  const address = TronWeb.address.fromPrivateKey(key.slice(2)) as string;
  const calls: string[] = [];
  const sign = vi.fn(async (tx: UnsignedTx) => {
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
  const client = new X402Service(
    new X402PaymentClient(fetcher),
    {
      assertCanSign() {},
      resolve: () => ({ kind: "software", address, sign, signTypedData }),
    } as never,
    {} as never,
    {} as never,
    undefined,
    undefined,
    signing,
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
  // Sponsored approval construction follows payment signing.
  expect(calls).toEqual(["payment-sign"]);
  expect(sign).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledOnce();
});

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
    headers: [],
    token: "USDT",
    maxAmount: "1",
  };

  it("reports the confirmed approval and a not-sent payment when the payment signature is refused", async () => {
    const { key, address, broadcast, challenge } = harness("auto");
    const warnings: string[] = [];
    const sign = vi.fn(async (tx: UnsignedTx) => tronSignStrategy.sign(key, tx));
    const signTypedData = vi.fn(async () => {
      throw new ChainError("signing_rejected", "declined on device");
    });
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(challenge, {
        status: 402,
        headers: { "payment-required": Buffer.from(JSON.stringify(challenge)).toString("base64") },
      }),
    );
    const client = new X402Service(
      new X402PaymentClient(fetcher),
      {
        assertCanSign() {},
        resolve: () => ({ kind: "software", address, sign, signTypedData }),
      } as never,
      {} as never,
      {} as never,
      undefined,
      fakeApprovals().approvals,
      signing,
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
    expect(broadcast).toEqual([]);
    expect(error).toMatchObject({
      code: "signing_rejected",
      details: {
        paymentStatus: "not_sent",
        retryPayment: false,
        approval: {
          txId: APPROVAL_TX,
          token: USDT_NILE,
          spender: PERMIT2_NILE,
          allowance: "unlimited",
          status: "confirmed",
        },
      },
    });
    expect(warnings.some((w) => w.includes(APPROVAL_TX))).toBe(true);
  });

  it.each(["text", "binary"])(
    "retains the approval after a settled %s response",
    async (contentType) => {
      const { key, address, broadcast, challenge } = harness("auto");
      const sign = vi.fn(async (tx: UnsignedTx) => tronSignStrategy.sign(key, tx));
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
        return new Response("ok", {
          headers: {
            "content-type": contentType === "binary" ? "application/octet-stream" : "text/plain",
            "payment-response": Buffer.from(
              JSON.stringify({
                success: true,
                network: "tron:0xcd8690dc",
                transaction: "a".repeat(64),
              }),
            ).toString("base64"),
          },
        });
      });
      const client = new X402Service(
        new X402PaymentClient(fetcher),
        {
          assertCanSign() {},
          resolve: () => ({ kind: "software", address, sign, signTypedData }),
        } as never,
        {} as never,
        {} as never,
        undefined,
        fakeApprovals().approvals,
        signing,
      );
      const pending = client.pay(
        { activeAccount: "payer", timeoutMs: 1000, emit() {}, warn() {} } as never,
        net,
        input,
      );
      const result = await pending.catch((error) => error);
      expect(broadcast).toEqual([]);
      const approval = {
        txId: APPROVAL_TX,
        token: USDT_NILE,
        spender: PERMIT2_NILE,
        status: "confirmed",
      };
      if (contentType === "binary") {
        expect(result).toMatchObject({
          code: "invalid_option",
          details: {
            paymentStatus: "settled",
            settled: true,
            txHash: "a".repeat(64),
            retryPayment: false,
            approval,
          },
        });
        expect(exitCodeOf(result)).toBe(2);
      } else {
        expect(result).toMatchObject({ delivered: true, settled: true, approval });
      }
    },
  );

  it("marks a sponsored approval as exported when the payment request then fails", async () => {
    const { key, address, broadcast, challenge } = harness("sponsored");
    const sign = vi.fn(async (tx: UnsignedTx) => tronSignStrategy.sign(key, tx));
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
    const client = new X402Service(
      new X402PaymentClient(fetcher),
      {
        assertCanSign() {},
        resolve: () => ({ kind: "software", address, sign, signTypedData }),
      } as never,
      {} as never,
      {} as never,
      undefined,
      fakeApprovals().approvals,
      signing,
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
  const client = new X402Service(
    new X402PaymentClient(fetcher),
    {
      assertCanSign() {},
      resolve: () => ({ kind: "software", address, sign, signTypedData }),
    } as never,
    {} as never,
    {} as never,
    undefined,
    undefined,
    signing,
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
