import { expect, it, vi } from "vitest";
import { X402Service } from "../../../application/use-cases/x402-service.js";
import type { SignerResolver } from "../../../application/services/signer/index.js";
import type { ProviderCatalogPort } from "../../../application/ports/provider-catalog.js";
import { X402PaymentClient } from "./payment-client.js";
import { X402HttpServer } from "./server.js";
import { baiPaymentResult } from "../../../application/services/bai-payment-result.js";

it.each([
  ["eip155:56", "56", "USDT", "10000000000000000000"],
  ["eip155:8453", "8453", "USDC", "10000000"],
])(
  "settles %s through the local roundtrip with the installed SDK",
  async (id, chainId, token, raw) => {
    const payer = "0x1111111111111111111111111111111111111111";
    const payTo = "0x2222222222222222222222222222222222222222";
    const transaction = "0x" + "a".repeat(64);
    const signTypedData = vi.fn(async (payload) => ({
      primaryType: payload.primaryType,
      signature: "0x" + "a".repeat(130),
    }));
    const resolver = {
      assertCanSign: vi.fn(),
      resolve: () => ({ address: payer, kind: "software", signTypedData }),
    } as unknown as SignerResolver;
    const facilitator = vi.fn(async (url, init) => {
      expect(String(url)).toMatch(/^https:\/\/facilitator.example\/(verify|settle)$/);
      expect(init.redirect).toBe("error");
      expect(init.headers).not.toHaveProperty("Authorization");
      const body = JSON.parse(init.body);
      expect(body.paymentRequirements).toMatchObject({
        network: id,
        scheme: "exact",
        amount: raw,
        payTo,
      });
      expect(body.paymentPayload).toMatchObject({
        x402Version: 2,
        accepted: body.paymentRequirements,
      });
      return Response.json(
        String(url).endsWith("/verify")
          ? { isValid: true, payer }
          : { success: true, transaction, network: id, payer },
      );
    });
    const service = new X402Service(
      new X402PaymentClient(resolver),
      {} as ProviderCatalogPort,
      new X402HttpServer(facilitator as typeof fetch),
    );
    const result = await service.roundtrip(
      { activeAccount: "payer", timeoutMs: 2000, emit: vi.fn() } as never,
      { id, chainId, family: "evm" } as never,
      {
        host: "127.0.0.1",
        port: 0,
        payTo,
        amount: "10",
        token,
        scheme: "exact",
        facilitatorUrl: "https://facilitator.example",
      },
    );
    expect(new URL(String(result.serve.payUrl)).port).not.toBe("0");
    expect(baiPaymentResult(result.pay, id)).toEqual({ txHash: transaction, payer });
    expect(signTypedData).toHaveBeenCalledOnce();
    expect(facilitator).toHaveBeenCalledTimes(2);
    await expect(fetch(String(result.serve.payUrl))).rejects.toThrow();
  },
);
