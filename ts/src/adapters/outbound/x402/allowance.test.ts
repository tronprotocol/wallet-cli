import { X402Service } from "../../../application/use-cases/x402-service.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Wallet, Interface } from "ethers";
import { TronWeb, providers, utils } from "tronweb";
import { X402PaymentClient } from "./payment-client.js";
import { X402FacilitatorClient } from "./facilitator-client.js";
import { X402PaywallHttpServer } from "../../inbound/http/x402/paywall-server.js";
import { tronSignStrategy } from "../chain/tron/signing-strategy.js";
import type { TypedDataPayload, UnsignedTx } from "../../../domain/types/index.js";
import { ChainError, TransportError } from "../../../domain/errors/index.js";
import type { Permit2ApproveRequest } from "../../../application/contracts/x402-payer.js";
import { SigningService } from "../../../application/services/signing/signing-service.js";
import { evmTransactionChainId } from "../chain/evm/evm.js";
import { exitCodeOf } from "../../inbound/cli/output/errors.js";
import { CommandDeadline } from "../../../application/services/command-deadline.js";
import {
  DeadlineExpiredError,
  type DispatchCheck,
} from "../../../application/contracts/deadline.js";
import { X402Permit2Approvals } from "../../../application/use-cases/x402-permit2-approval.js";
import { TxPipeline } from "../../../application/services/pipeline/index.js";

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
function fakeApprovals(
  fail?: Error,
  failAfterConfirm?: Error,
  afterConfirm?: (request: Permit2ApproveRequest) => Promise<unknown>,
) {
  const requests: Permit2ApproveRequest[] = [];
  const state = { granted: false };
  const approvals = {
    approver: () => ({
      approve: async (request: Permit2ApproveRequest) => {
        requests.push(request);
        if (fail) throw fail;
        const approval = {
          txId: APPROVAL_TX,
          token: request.token,
          spender: request.spender,
          allowance: "unlimited" as const,
          feeLimitSun: 100_000_000,
        };
        request.onConfirmed(approval);
        if (failAfterConfirm) throw failAfterConfirm;
        await afterConfirm?.(request);
        state.granted = true;
        return approval;
      },
    }),
  };
  return { requests, state, approvals };
}

it.each(["sufficient", "auto", "sponsored", "reverted", "recheck-fails", "expires-after-confirm"])(
  "handles TRON allowance through the installed SDK: %s",
  async (mode) => {
    let now = 0;
    const deadline =
      mode === "expires-after-confirm"
        ? new CommandDeadline(60_000, 0, { now: () => now })
        : new CommandDeadline(0);
    const fake = fakeApprovals(
      mode === "reverted"
        ? new ChainError("execution_reverted", "the Permit2 approval failed on chain", {
            txId: APPROVAL_TX,
          })
        : undefined,
      mode === "recheck-fails"
        ? new TransportError("timeout", "the allowance read timed out")
        : undefined,
      // The time runs out once the approval confirms; the allowance re-read is refused.
      mode === "expires-after-confirm"
        ? async (request) => {
            now = 60_000;
            return request.readAllowance();
          }
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
      undefined,
      fake.approvals,
      signing,
    );
    const payment = client.pay(
      { activeAccount: "payer", deadline, emit() {}, warn() {} } as never,
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
    } else if (mode === "recheck-fails" || mode === "expires-after-confirm") {
      await expect(payment).rejects.toMatchObject({
        code: "timeout",
        details: {
          paymentStatus: "not_sent",
          approval: { txId: APPROVAL_TX, allowance: "unlimited", status: "confirmed" },
        },
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
            onSubmitted: expect.any(Function),
            onConfirmed: expect.any(Function),
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
    deadline.dispose();
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
    undefined,
    undefined,
    signing,
  );
  const error = await client
    .pay(
      { activeAccount: "payer", deadline: new CommandDeadline(0), emit() {}, warn() {} } as never,
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
      undefined,
      fakeApprovals().approvals,
      signing,
    );
    const error = await client
      .pay(
        {
          activeAccount: "payer",
          deadline: new CommandDeadline(0),
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
        undefined,
        fakeApprovals().approvals,
        signing,
      );
      const pending = client.pay(
        { activeAccount: "payer", deadline: new CommandDeadline(0), emit() {}, warn() {} } as never,
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
      undefined,
      fakeApprovals().approvals,
      signing,
    );
    const error = await client
      .pay(
        { activeAccount: "payer", deadline: new CommandDeadline(0), emit() {}, warn() {} } as never,
        net,
        input,
      )
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
    undefined,
    undefined,
    signing,
  );
  await expect(
    client.pay(
      { activeAccount: "payer", deadline: new CommandDeadline(0), emit() {}, warn() {} } as never,
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

it("keeps the confirmed approval and pays nothing when a TRON roundtrip runs out after the approval", async () => {
  let now = 0;
  const deadline = new CommandDeadline(60_000, 0, { now: () => now });
  const fake = fakeApprovals(undefined, undefined, async (request) => {
    now = 60_000;
    return request.readAllowance();
  });
  const key = Wallet.createRandom().privateKey;
  const address = TronWeb.address.fromPrivateKey(key.slice(2)) as string;
  const signTypedData = vi.fn(async (payload: TypedDataPayload) =>
    tronSignStrategy.signTypedData(key, payload),
  );
  vi.spyOn(providers.HttpProvider.prototype, "request").mockImplementation(async (path) => {
    if (path === "wallet/triggerconstantcontract")
      return { result: { result: true }, constant_result: ["0".repeat(64)] };
    throw new Error(`Unexpected RPC ${path}`);
  });
  const facilitatorCalls: string[] = [];
  const facilitator = vi.fn<typeof fetch>(async (url) => {
    const path = new URL(String(url)).pathname;
    facilitatorCalls.push(path);
    return Response.json({
      kinds: [{ x402Version: 2, scheme: "exact", network: "tron:0xcd8690dc" }],
    });
  });
  const service = new X402Service(
    new X402PaymentClient(),
    { assertCanSign() {}, resolve: () => ({ kind: "software", address, signTypedData }) } as never,
    {
      facilitator: new X402FacilitatorClient(facilitator),
      host: new X402PaywallHttpServer(
        () => {},
        () => {},
      ),
      requestTimeoutMs: 0,
    },
    fake.approvals,
    signing,
  );
  const roundtrip = service.roundtrip(
    { activeAccount: "payer", deadline, emit() {}, warn() {} } as never,
    {
      id: "tron:3448148188",
      chainId: "3448148188",
      family: "tron",
      httpEndpoint: "http://127.0.0.1:1",
    } as never,
    {
      host: "127.0.0.1",
      port: 0,
      payTo: "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ",
      amount: "1",
      token: "USDT",
      scheme: "exact",
      facilitatorUrl: "https://facilitator.example",
    },
  );
  await expect(roundtrip).rejects.toMatchObject({
    code: "timeout",
    details: {
      paymentStatus: "not_sent",
      approval: { txId: APPROVAL_TX, allowance: "unlimited", status: "confirmed" },
    },
  });
  expect(fake.requests).toHaveLength(1);
  expect(signTypedData).not.toHaveBeenCalled();
  expect(facilitatorCalls).toEqual(["/supported"]);
  deadline.dispose();
});

it("ends a hung TRON SDK read at the command deadline and refuses every later SDK call", async () => {
  const key = Wallet.createRandom().privateKey;
  const address = TronWeb.address.fromPrivateKey(key.slice(2)) as string;
  const paths: string[] = [];
  let release: (() => void) | undefined;
  vi.spyOn(providers.HttpProvider.prototype, "request").mockImplementation(async (path) => {
    paths.push(path);
    await new Promise<void>((resolve) => (release = resolve));
    return { result: { result: true }, constant_result: ["f".repeat(64)] };
  });
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
  };
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json(challenge, {
      status: 402,
      headers: { "payment-required": Buffer.from(JSON.stringify(challenge)).toString("base64") },
    }),
  );
  const signTypedData = vi.fn(async (payload: TypedDataPayload) =>
    tronSignStrategy.signTypedData(key, payload),
  );
  const client = new X402Service(
    new X402PaymentClient(fetcher),
    {
      assertCanSign() {},
      resolve: () => ({ kind: "software", address, sign: vi.fn(), signTypedData }),
    } as never,
    undefined,
    fakeApprovals().approvals,
    signing,
  );
  // Just above the submit reserve, so the payment starts and the read hangs past expiry.
  const deadline = new CommandDeadline(2_100);
  const payment = client.pay(
    { activeAccount: "payer", deadline, emit() {}, warn() {} } as never,
    {
      id: "tron:3448148188",
      chainId: "3448148188",
      family: "tron",
      httpEndpoint: "http://127.0.0.1:1",
    } as never,
    { url: "https://payment.example", method: "GET", headers: [], token: "USDT", maxAmount: "1" },
  );
  await expect(payment).rejects.toMatchObject({
    code: "timeout",
    details: { phase: "create_payment", paymentStatus: "not_sent" },
  });
  release?.();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(paths).toEqual(["wallet/triggerconstantcontract"]);
  expect(signTypedData).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledOnce();
  deadline.dispose();
});

it("names a sent approval whose confirmation the command deadline ended", async () => {
  const key = Wallet.createRandom().privateKey;
  const address = TronWeb.address.fromPrivateKey(key.slice(2)) as string;
  vi.spyOn(providers.HttpProvider.prototype, "request").mockImplementation(async (path) => {
    if (path === "wallet/triggerconstantcontract")
      return { result: { result: true }, constant_result: ["0".repeat(64)] };
    throw new Error(`Unexpected RPC ${path}`);
  });
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
  };
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json(challenge, {
      status: 402,
      headers: { "payment-required": Buffer.from(JSON.stringify(challenge)).toString("base64") },
    }),
  );
  const signTypedData = vi.fn(async (payload: TypedDataPayload) =>
    tronSignStrategy.signTypedData(key, payload),
  );
  // The approval was broadcast and its confirmation outlives the deadline.
  const approvals = {
    approver: () => ({
      approve: async (request: Permit2ApproveRequest) => {
        request.onSubmitted(APPROVAL_TX);
        return new Promise<never>(() => {});
      },
    }),
  };
  const client = new X402Service(
    new X402PaymentClient(fetcher),
    {
      assertCanSign() {},
      resolve: () => ({ kind: "software", address, sign: vi.fn(), signTypedData }),
    } as never,
    undefined,
    approvals,
    signing,
  );
  const deadline = new CommandDeadline(2_100);
  const error = (await client
    .pay(
      { activeAccount: "payer", deadline, emit() {}, warn() {} } as never,
      {
        id: "tron:3448148188",
        chainId: "3448148188",
        family: "tron",
        httpEndpoint: "http://127.0.0.1:1",
      } as never,
      { url: "https://payment.example", method: "GET", headers: [], token: "USDT", maxAmount: "1" },
    )
    .catch((e: unknown) => e)) as { code: string; details: object; message: string };
  deadline.dispose();
  expect(error).toMatchObject({
    code: "timeout",
    details: {
      txId: APPROVAL_TX,
      outcome: "unknown",
      phase: "create_payment",
      paymentStatus: "not_sent",
      retryPayment: false,
    },
  });
  expect(error.message).toContain(APPROVAL_TX);
  expect(error.details).not.toHaveProperty("approval");
  expect(signTypedData).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledOnce();
});

describe("x402 TRON approval through the real approval pipeline", () => {
  const SIGNED_ID = "ef".repeat(32);
  async function payWith(broadcast: (check: DispatchCheck) => Promise<never>) {
    const key = Wallet.createRandom().privateKey;
    const address = TronWeb.address.fromPrivateKey(key.slice(2)) as string;
    vi.spyOn(providers.HttpProvider.prototype, "request").mockImplementation(async (path) => {
      if (path === "wallet/triggerconstantcontract")
        return { result: { result: true }, constant_result: ["0".repeat(64)] };
      throw new Error(`Unexpected RPC ${path}`);
    });
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
    };
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(challenge, {
        status: 402,
        headers: { "payment-required": Buffer.from(JSON.stringify(challenge)).toString("base64") },
      }),
    );
    const gateway = {
      triggerSmartContract: async () => ({
        txID: SIGNED_ID,
        raw_data: { timestamp: Date.now(), expiration: Date.now() + 60_000, contract: [{}] },
      }),
      estimateResources: async () => ({ feeModel: "tron-resource", energy: 1 }),
      prepareTransaction: async (tx: unknown) => tx,
      encodeTransactionHex: () => "0a02",
      getSignWeight: async () => ({
        permission: { id: 0, name: "owner", threshold: 1, keys: [{ address, weight: 1 }] },
        approvedList: [],
        currentWeight: 0,
        resultCode: "NOT_ENOUGH_PERMISSION",
        message: "",
      }),
      getApprovedList: async () => [],
      broadcast: vi.fn((_signed: unknown, check: DispatchCheck) => broadcast(check)),
    };
    const signer = {
      kind: "software",
      address,
      sign: async (tx: object) => ({ ...tx, signature: ["00"] }),
      signTypedData: vi.fn(),
    };
    const signers = { assertCanSign() {}, resolve: () => signer } as never;
    const approvals = new X402Permit2Approvals(
      { get: () => gateway } as never,
      new TxPipeline(signers, new SigningService({} as never)),
    );
    const client = new X402Service(
      new X402PaymentClient(fetcher),
      signers,
      undefined,
      approvals,
      signing,
    );
    // Leaves the submit reserve for the payment and for the approval's broadcast.
    const deadline = new CommandDeadline(2_600);
    const error = (await client
      .pay(
        {
          activeAccount: "payer",
          deadline,
          resolveAddress: () => address,
          emit() {},
          warn() {},
        } as never,
        {
          id: "tron:3448148188",
          chainId: "3448148188",
          family: "tron",
          httpEndpoint: "http://127.0.0.1:1",
        } as never,
        {
          url: "https://payment.example",
          method: "GET",
          headers: [],
          token: "USDT",
          maxAmount: "1",
        },
      )
      .catch((e: unknown) => e)) as Error & { code: string; details: object };
    deadline.dispose();
    return { error, gateway, signer, fetcher };
  }

  it("reports a dispatched approval whose broadcast response outlives the deadline", async () => {
    const { error, gateway, signer, fetcher } = await payWith((check) => {
      check.assertDispatchable();
      return new Promise<never>(() => {});
    });
    expect(gateway.broadcast).toHaveBeenCalledOnce();
    expect(error).not.toBeInstanceOf(DeadlineExpiredError);
    expect(error).toMatchObject({
      code: "timeout",
      details: {
        txId: SIGNED_ID,
        outcome: "unknown",
        paymentStatus: "not_sent",
        retryPayment: false,
      },
    });
    expect(signer.signTypedData).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("keeps a definite rejection of the dispatched approval without a txId", async () => {
    const { error } = await payWith(async (check) => {
      check.assertDispatchable();
      throw new ChainError("transaction_rejected", "CONTRACT_VALIDATE_ERROR");
    });
    expect(error).toMatchObject({
      code: "transaction_rejected",
      details: { paymentStatus: "not_sent" },
    });
    expect(error.details).not.toHaveProperty("txId");
    expect(error.details).not.toHaveProperty("outcome");
  });
});
