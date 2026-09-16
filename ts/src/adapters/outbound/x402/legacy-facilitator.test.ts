import { afterEach, expect, it, vi } from "vitest";
import { Wallet } from "ethers";
import { TronWeb, providers } from "tronweb";
import { X402Service } from "../../../application/use-cases/x402-service.js";
import { tronSignStrategy } from "../chain/tron/signing-strategy.js";
import { X402PaymentClient } from "./payment-client.js";
import { X402HttpServer } from "./server.js";
import type { TypedDataPayload } from "../../../domain/types/index.js";

afterEach(() => vi.restoreAllMocks());

it.each(
  ["hex", "decimal", "both"].flatMap((capability) =>
    ["tron:0xcd8690dc", "tron:3448148188", "verify-failure", "settle-failure"].map(
      (outcome) => [capability, outcome] as const,
    ),
  ),
)("roundtrip negotiates %s support (%s) without retrying payment", async (capability, outcome) => {
  const networks =
    capability === "hex"
      ? ["tron:0xcd8690dc"]
      : capability === "decimal"
        ? ["tron:3448148188"]
        : ["tron:0xcd8690dc", "tron:3448148188"];
  const expectedNetwork = capability === "hex" ? "tron:0xcd8690dc" : "tron:3448148188";
  vi.spyOn(providers.HttpProvider.prototype, "request").mockImplementation(async (path) => {
    if (path === "wallet/triggerconstantcontract")
      return { result: { result: true }, constant_result: ["f".repeat(64)] };
    throw new Error(`Unexpected payer RPC ${path}`);
  });
  const key = Wallet.createRandom().privateKey;
  const payer = TronWeb.address.fromPrivateKey(key.slice(2)) as string;
  const signTypedData = vi.fn((payload: TypedDataPayload) =>
    tronSignStrategy.signTypedData(key, payload),
  );
  const signers = {
    assertCanSign: vi.fn(),
    resolve: () => ({ kind: "software", address: payer, signTypedData }),
  };
  const calls: string[] = [];
  const payloads: unknown[] = [];
  const facilitator: typeof fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    calls.push(path);
    if (path === "/supported")
      return Response.json({
        kinds: networks.map((network) => ({ x402Version: 2, scheme: "exact", network })),
      });
    const body = JSON.parse(String(init!.body));
    // Routing uses exactly the representation advertised for this scheme.
    expect(body.paymentRequirements.network).toBe(expectedNetwork);
    expect(body.paymentPayload.accepted).toEqual(body.paymentRequirements);
    payloads.push(body.paymentPayload);
    if (outcome === `${path.slice(1)}-failure`) return new Response(null, { status: 500 });
    return Response.json(
      path === "/verify"
        ? { isValid: true, payer }
        : { success: true, transaction: "a".repeat(64), network: outcome, payer },
    );
  };
  const service = new X402Service(
    new X402PaymentClient(signers as never),
    {} as never,
    new X402HttpServer(facilitator, 2000, () => {}),
  );
  const pending = service.roundtrip(
    { activeAccount: "payer", timeoutMs: 2000, emit: vi.fn(), warn: vi.fn() } as never,
    {
      id: "tron:3448148188",
      family: "tron",
      chainId: "3448148188",
      httpEndpoint: "http://127.0.0.1:1",
    } as never,
    {
      host: "127.0.0.1",
      port: 0,
      payTo: "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ",
      amount: "1",
      token: "USDT",
      scheme: "exact",
      facilitatorUrl: "https://legacy.example",
    },
  );
  if (outcome.endsWith("failure")) {
    await expect(pending).rejects.toMatchObject({ details: { retryPayment: false } });
  } else {
    const result = await pending;
    expect(result.serve.network).toBe("tron:3448148188");
    expect(result.pay).toMatchObject({ settled: true, delivered: true });
  }
  expect(signTypedData).toHaveBeenCalledOnce();
  expect(calls).toEqual(
    outcome === "verify-failure" ? ["/supported", "/verify"] : ["/supported", "/verify", "/settle"],
  );
  if (payloads.length === 2) expect(payloads[1]).toEqual(payloads[0]);
});
