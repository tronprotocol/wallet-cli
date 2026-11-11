import { X402Service } from "../../../application/use-cases/x402-service.js";
import { describe, expect, it, vi } from "vitest";
import { Wallet, verifyTypedData } from "ethers";
import { X402PaymentClient } from "./payment-client.js";
import type { SignerResolver } from "../../../application/services/signer/index.js";
import type { TransactionScope } from "../../../application/contracts/execution-scope.js";
import type { NetworkDescriptor, TypedDataPayload } from "../../../domain/types/index.js";
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

const network = { id: "eip155:8453", family: "evm", chainId: "8453" } as NetworkDescriptor;
const scope = {
  activeAccount: "test",
  deadline: new CommandDeadline(0),
  emit: vi.fn(),
} as unknown as TransactionScope;
const input = { url: "https://example.test/paid", method: "GET", headers: [] };

function fixture(wrongType = false, multiple = false) {
  const wallet = Wallet.createRandom();
  const signTypedData = vi.fn(async (payload: TypedDataPayload) => ({
    signature: await wallet.signTypedData(payload.domain, payload.types, payload.message),
    digest: "unused",
    primaryType: wrongType ? "WrongType" : payload.primaryType,
  }));
  const resolver = {
    assertCanSign: vi.fn(),
    resolve: vi.fn(() => ({ address: wallet.address, kind: "software", signTypedData })),
  } as unknown as SignerResolver;
  const fetcher = vi.fn<typeof fetch>();
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
        extra: {
          name: "USD Coin",
          version: "2",
          paymentFlow: multiple ? "upfront" : "authorization",
        },
      },
    ],
  };
  if (multiple)
    challenge.accepts.push({
      ...challenge.accepts[0]!,
      amount: "100",
      extra: { name: "USD Coin", version: "2", paymentFlow: "authorization" },
    });
  fetcher.mockResolvedValueOnce(
    new Response(null, {
      status: 402,
      headers: { "payment-required": Buffer.from(JSON.stringify(challenge)).toString("base64") },
    }),
  );
  fetcher.mockResolvedValueOnce(new Response("ok"));
  return {
    wallet,
    signTypedData,
    fetcher,
    client: new X402Service(
      new X402PaymentClient(fetcher),
      resolver,
      undefined,
      undefined,
      signing,
    ),
  };
}

describe("x402 SDK payer integration", () => {
  it("uses the selected wallet to sign a Base USDC authorization and retries once", async () => {
    const { wallet, signTypedData, fetcher, client } = fixture();
    await expect(client.pay(scope, network, input)).resolves.toMatchObject({ delivered: true });
    expect(signTypedData).toHaveBeenCalledOnce();
    const payload = signTypedData.mock.calls[0]![0];
    const signed = await signTypedData.mock.results[0]!.value;
    expect(verifyTypedData(payload.domain, payload.types, payload.message, signed.signature)).toBe(
      wallet.address,
    );
    expect(payload.primaryType).toBe("TransferWithAuthorization");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((fetcher.mock.calls[1]![0] as Request).headers.has("payment-signature")).toBe(true);
  });

  it("does not send a payment when the signer returns a different primary type", async () => {
    const { fetcher, client } = fixture(true);
    await expect(client.pay(scope, network, input)).rejects.toMatchObject({
      code: "signed_payload_mismatch",
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

it("keeps the SDK on the requirement whose spend limit was checked", async () => {
  const { client, signTypedData } = fixture(false, true);
  await client.pay(scope, network, {
    ...input,
    maxRawAmount: "10",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  });
  expect(signTypedData.mock.calls[0]![0].message.value).toBe(1n);
});

describe("x402 pay under the command deadline", () => {
  function timed(spentBySigning: number) {
    let now = 0;
    const deadline = new CommandDeadline(10_000, 0, { now: () => now });
    const parts = fixture();
    parts.signTypedData.mockImplementationOnce(async (payload: TypedDataPayload) => {
      now += spentBySigning;
      return {
        signature: await parts.wallet.signTypedData(payload.domain, payload.types, payload.message),
        digest: "unused",
        primaryType: payload.primaryType,
      };
    });
    return { ...parts, deadline, scope: { ...scope, deadline } as TransactionScope };
  }

  it("sends no paid request when too little time is left after signing", async () => {
    const { client, fetcher, deadline, scope: timedScope } = timed(8_500);

    await expect(client.pay(timedScope, network, input)).rejects.toMatchObject({
      code: "timeout",
      details: { phase: "payment_request", retryPayment: false },
    });
    expect(fetcher).toHaveBeenCalledOnce();
    deadline.dispose();
  });

  it("sends no paid request when the deadline ends during signing", async () => {
    const { client, fetcher, deadline, scope: timedScope } = timed(10_000);

    await expect(client.pay(timedScope, network, input)).rejects.toMatchObject({
      code: "timeout",
      details: { retryPayment: false },
    });
    expect(fetcher).toHaveBeenCalledOnce();
    deadline.dispose();
  });

  it("pays when the time left after signing covers the submit reserve", async () => {
    const { client, fetcher, deadline, scope: timedScope } = timed(8_000);

    await expect(client.pay(timedScope, network, input)).resolves.toMatchObject({
      delivered: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    deadline.dispose();
  });
});
