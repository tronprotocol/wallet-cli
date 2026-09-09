import { afterEach, expect, it, vi } from "vitest";
import { Wallet, Interface } from "ethers";
import { TronWeb, providers, utils } from "tronweb";
import { X402PaymentClient } from "./payment-client.js";
import { tronSignStrategy } from "../chain/tron/signing-strategy.js";
import type { TypedDataPayload } from "../../../domain/types/index.js";

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
      { activeAccount: "payer", timeoutMs: 1000, emit() {} } as never,
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
