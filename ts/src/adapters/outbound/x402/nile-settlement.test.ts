import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Interface, Wallet } from "ethers";
import { TronWeb, providers, utils as tronUtils } from "tronweb";
import { ExactTronScheme } from "@bankofai/x402-tron/exact/facilitator";
import type { FacilitatorTronSigner } from "@bankofai/x402-tron";
import type { PaymentPayload, PaymentRequirements } from "@bankofai/x402-core/types";
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

it.each([true, false])(
  "Nile SDK settlement with sufficient Permit2 allowance=%s",
  async (approved) => {
    const payerKey = Wallet.createRandom().privateKey;
    const payer = TronWeb.address.fromPrivateKey(payerKey.slice(2)) as string;
    const facilitatorKey = Wallet.createRandom().privateKey;
    const facilitator = TronWeb.address.fromPrivateKey(facilitatorKey.slice(2)) as string;
    const signTypedData = vi.fn((payload: TypedDataPayload) =>
      tronSignStrategy.signTypedData(payerKey, payload),
    );
    const signers = {
      assertCanSign: vi.fn(),
      resolve: vi.fn(() => ({ kind: "software", address: payer, signTypedData })),
    };
    const requirement: PaymentRequirements = {
      scheme: "exact",
      network: "tron:0xcd8690dc",
      amount: "1000000",
      asset: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
      payTo: "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ",
      maxTimeoutSeconds: 300,
      extra: { assetTransferMethod: "permit2" },
    };
    const transactions = new Map<string, unknown>();
    // This boundary simulates node acceptance. No network or chain VM is used.
    const broadcast = vi.fn(async (signed: { txID: string; signature: string[] }) => {
      expect(signed.signature[0]).toMatch(/^[0-9a-f]{130}$/i);
      expect(
        tronUtils.transaction
          .txPbToTxID(tronUtils.transaction.txJsonToPb(signed as never))
          .replace(/^0x/, ""),
      ).toBe(signed.txID);
      expect(tronUtils.crypto.ecRecover(signed.txID, signed.signature[0]!).toLowerCase()).toBe(
        TronWeb.address.toHex(facilitator).toLowerCase(),
      );
      transactions.set(signed.txID, signed);
      return signed.txID;
    });
    const readContract = vi.fn<FacilitatorTronSigner["readContract"]>(async ({ functionName }) => {
      if (functionName === "allowance") return approved ? 1000000n : 0n;
      if (functionName === "balanceOf") return 10000000n;
      throw new Error(`Unexpected read ${functionName}`);
    });
    const writeContract = vi.fn<FacilitatorTronSigner["writeContract"]>(async (call) => {
      expect(call.functionName).toBe("settle");
      const encoded = new Interface(call.abi as never).encodeFunctionData(
        call.functionName,
        call.args,
      );
      const shell = {
        visible: false,
        raw_data: {
          contract: [
            {
              type: "TriggerSmartContract",
              parameter: {
                type_url: "type.googleapis.com/protocol.TriggerSmartContract",
                value: {
                  owner_address: TronWeb.address.toHex(facilitator),
                  contract_address: TronWeb.address.toHex(call.address),
                  data: encoded.slice(2),
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
      const pb = tronUtils.transaction.txJsonToPb(shell as never);
      const unsigned = {
        ...shell,
        txID: tronUtils.transaction.txPbToTxID(pb).replace(/^0x/, ""),
        raw_data_hex: tronUtils.transaction.txPbToRawDataHex(pb).toLowerCase(),
      };
      const signed = await tronSignStrategy.sign(facilitatorKey, unsigned);
      return broadcast(signed as { txID: string; signature: string[] });
    });
    const waitForTransactionReceipt = vi.fn<FacilitatorTronSigner["waitForTransactionReceipt"]>(
      async ({ hash }) => {
        expect(transactions.has(hash)).toBe(true);
        return { status: "success" };
      },
    );
    const scheme = new ExactTronScheme({
      getAddresses: () => [facilitator],
      readContract,
      writeContract,
      waitForTransactionReceipt,
      verifyTypedData: async ({ domain, types, message, signature, address }) =>
        tronUtils.typedData
          .verifyTypedData(domain, types as never, message, signature)
          .toLowerCase() === address.toLowerCase(),
    });
    let settlement: Awaited<ReturnType<typeof scheme.settle>> | undefined;
    const fetcher = vi.fn<typeof fetch>(async (request, init) => {
      const req = new Request(request, init);
      const header = req.headers.get("payment-signature");
      if (!header)
        return new Response(null, {
          status: 402,
          headers: {
            "payment-required": Buffer.from(
              JSON.stringify({
                x402Version: 2,
                resource: { url: req.url },
                accepts: [requirement],
              }),
            ).toString("base64"),
          },
        });
      const payload = JSON.parse(Buffer.from(header, "base64").toString()) as PaymentPayload;
      settlement = await scheme.settle(payload, requirement);
      if (!settlement.success) throw new Error(settlement.errorReason);
      return new Response(JSON.stringify({ transaction_hash: settlement.transaction }), {
        headers: {
          "content-type": "application/json",
          "payment-response": Buffer.from(JSON.stringify(settlement)).toString("base64"),
        },
      });
    });
    const client = new X402PaymentClient(signers as never, fetcher);
    const payment = client.pay(
      { activeAccount: "payer", timeoutMs: 1000, emit: vi.fn() } as never,
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
    );
    if (approved) {
      await expect(payment).resolves.toMatchObject({
        settled: true,
        delivered: true,
        paymentResponse: { success: true, network: "tron:0xcd8690dc" },
      });
      expect(settlement?.transaction).toMatch(/^[0-9a-f]{64}$/);
      expect(broadcast).toHaveBeenCalledOnce();
      expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: settlement?.transaction });
    } else {
      await expect(payment).rejects.toMatchObject({ code: "permit2_allowance_required" });
      expect(settlement).toMatchObject({ success: false });
      expect(broadcast).not.toHaveBeenCalled();
      expect(writeContract).not.toHaveBeenCalled();
    }
    expect(signTypedData).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledTimes(2);
  },
);
