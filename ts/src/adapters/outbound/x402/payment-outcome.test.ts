import { X402Service } from "../../../application/use-cases/x402-service.js";
import { BaiRechargeFlow } from "../../../application/use-cases/bai-recharge-flow.js";
import { afterEach, expect, it } from "vitest";
import { Wallet } from "ethers";
import { X402PaymentClient } from "./payment-client.js";
import type { SignerResolver } from "../../../application/services/signer/index.js";
import type { NetworkDescriptor, TypedDataPayload } from "../../../domain/types/index.js";
import { SigningService } from "../../../application/services/signing/signing-service.js";
import { CommandDeadline } from "../../../application/services/command-deadline.js";
import { DeadlineExpiredError } from "../../../application/contracts/deadline.js";

const network = { id: "eip155:8453", family: "evm", chainId: "8453" } as NetworkDescriptor;
const input = { url: "https://example.test/paid", method: "GET", headers: [] };
const challenge = {
  x402Version: 2,
  resource: { url: input.url },
  accepts: [
    {
      scheme: "exact",
      network: network.id,
      amount: "1",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      payTo: "0x1111111111111111111111111111111111111111",
      maxTimeoutSeconds: 300,
      extra: { name: "USD Coin", version: "2", paymentFlow: "authorization" },
    },
  ],
};
const signing = new SigningService({
  get: () => ({ referenceBlockStatus: async () => "held" }),
} as never);

let deadline: CommandDeadline;
afterEach(() => deadline.dispose());

// Real SDK flow on a controlled clock; the second request carries the payment.
function fixture(
  paid: (now: { ms: number }, signal: AbortSignal) => Promise<Response>,
  afterSign?: (now: { ms: number }) => void,
) {
  const now = { ms: 0 };
  deadline = new CommandDeadline(10_000, 0, { now: () => now.ms });
  const wallet = Wallet.createRandom();
  const sent = { paidRequests: 0 };
  const resolver = {
    assertCanSign: () => {},
    resolve: () => ({
      address: wallet.address,
      kind: "software",
      signTypedData: async (payload: TypedDataPayload) => {
        const signature = await wallet.signTypedData(
          payload.domain,
          payload.types,
          payload.message,
        );
        afterSign?.(now);
        return { signature, digest: "unused", primaryType: payload.primaryType };
      },
    }),
  } as unknown as SignerResolver;
  let calls = 0;
  const fetcher = async (_request: unknown, init?: RequestInit) => {
    calls++;
    if (calls === 1)
      return new Response(null, {
        status: 402,
        headers: {
          "payment-required": Buffer.from(JSON.stringify(challenge)).toString("base64"),
        },
      });
    sent.paidRequests++;
    return paid(now, init!.signal!);
  };
  const service = new X402Service(
    new X402PaymentClient(fetcher as typeof fetch),
    resolver,
    undefined,
    undefined,
    signing,
  );
  const scope = { activeAccount: "test", deadline, emit: () => {}, warn: () => {} } as never;
  return { sent, pay: () => service.pay(scope, network, input) };
}

it("marks a paid request that times out after dispatch as an unknown outcome", async () => {
  const { sent, pay } = fixture((now, signal) => {
    now.ms = 10_000;
    deadline.expired();
    return Promise.reject(signal.reason);
  });
  const error = await pay().catch((e: unknown) => e);
  expect(sent.paidRequests).toBe(1);
  expect(error).toMatchObject({
    code: "timeout",
    details: { paymentStatus: "unknown", outcome: "unknown", retryPayment: false },
  });
});

it("marks an oversized paid response without a receipt as an unknown outcome", async () => {
  const { sent, pay } = fixture(
    async () => new Response("oversized", { headers: { "content-length": String(11 << 20) } }),
  );
  const error = await pay().catch((e: unknown) => e);
  expect(sent.paidRequests).toBe(1);
  expect(error).toMatchObject({
    code: "response_too_large",
    details: { paymentStatus: "unknown", outcome: "unknown", retryPayment: false },
  });
});

it("reports a paid request the deadline refuses before dispatch as not sent", async () => {
  // Signing leaves 1500 ms, below what the submit check admits.
  const { sent, pay } = fixture(
    async () => new Response("unreachable"),
    (now) => {
      now.ms = 8_500;
    },
  );
  const error = (await pay().catch((e: unknown) => e)) as { code: string; details: object };
  expect(sent.paidRequests).toBe(0);
  expect(error).toMatchObject({ code: "timeout", details: { paymentStatus: "not_sent" } });
  expect(error).toBeInstanceOf(DeadlineExpiredError);
  expect(error.details).not.toHaveProperty("outcome");
});

it("keeps a B.AI recharge whose payment was refused before dispatch free of an unknown outcome", async () => {
  // Signing leaves 1500 ms, below what the submit check admits.
  const { sent, pay } = fixture(
    async () => new Response("unreachable"),
    (now) => {
      now.ms = 8_500;
    },
  );
  const flow = new BaiRechargeFlow(
    {
      createOrder: async () => ({ orderId: "order-1" }),
      reportTxHash: async () => {
        throw new Error("must not report");
      },
    },
    { pay } as never,
  );
  const error = (await flow
    .execute(deadline, {
      channel: "crypto",
      chain: "base",
      tokenName: "USDC",
      amount: "1",
      walletAddress: "0x1111111111111111111111111111111111111111",
      deviceType: "web",
    } as never)
    .catch((e: unknown) => e)) as { code: string; details: object };
  expect(sent.paidRequests).toBe(0);
  expect(error).toMatchObject({
    code: "timeout",
    details: { paymentStatus: "not_sent", orderId: "order-1" },
  });
  expect(error).toBeInstanceOf(DeadlineExpiredError);
  expect(error.details).not.toHaveProperty("outcome");
});
