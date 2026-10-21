// A raw payment limit has no unit: it must be pinned to one token, or a seller can price the
// route in any asset (or the same asset at another precision) under a cap sized for a stablecoin.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Wallet } from "ethers";
import { TronWeb, providers } from "tronweb";
import { X402PaymentClient } from "./payment-client.js";
import { evmSignStrategy } from "../chain/evm/signing-strategy.js";
import { tronSignStrategy } from "../chain/tron/signing-strategy.js";
import type { X402PayInput } from "../../../application/ports/x402-payment.js";
import type { SignerResolver } from "../../../application/services/signer/index.js";
import type { TransactionScope } from "../../../application/contracts/execution-scope.js";
import type { NetworkDescriptor, TypedDataPayload } from "../../../domain/types/index.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955"; // 18 decimals
const BSC_BTCB = "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c"; // 18 decimals, not registered
const TRON_USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"; // 6 decimals
const ONE_E18 = "1000000000000000000";

const scope = {
  activeAccount: "payer",
  timeoutMs: 2000,
  emit() {},
  warn() {},
} as unknown as TransactionScope;

interface Outcome {
  result?: Record<string, unknown>;
  error?: { code?: string };
  typedData: TypedDataPayload[];
  txs: unknown[];
  requests: number;
  paidRequests: number;
}

function seller(requirement: Record<string, unknown>, out: Outcome): typeof fetch {
  const challenge = {
    x402Version: 2,
    resource: { url: "https://seller.example" },
    accepts: [{ maxTimeoutSeconds: 300, ...requirement }],
  };
  return async (request, init) => {
    out.requests++;
    if (!new Request(request, init).headers.get("payment-signature"))
      return new Response(null, {
        status: 402,
        headers: { "payment-required": Buffer.from(JSON.stringify(challenge)).toString("base64") },
      });
    out.paidRequests++;
    return new Response("ok");
  };
}

async function payEvm(asset: string, input: Partial<X402PayInput>): Promise<Outcome> {
  const wallet = Wallet.createRandom();
  // Permit2 already holds an allowance, so the only signature is the payment authorization.
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (request, init) => {
      const body = (await new Request(request, init).json()) as { method: string; id: number };
      const result =
        body.method === "eth_call"
          ? "0x" + "f".repeat(64)
          : body.method === "eth_getTransactionCount"
            ? "0x3"
            : null;
      return Response.json({ jsonrpc: "2.0", id: body.id, result });
    }),
  );
  const out: Outcome = { typedData: [], txs: [], requests: 0, paidRequests: 0 };
  const signers = {
    assertCanSign() {},
    prepare() {},
    resolve: () => ({
      address: wallet.address,
      kind: "software",
      sign: (tx: unknown) => {
        out.txs.push(tx);
        return evmSignStrategy.sign(wallet.privateKey, tx as never);
      },
      signTypedData: (payload: TypedDataPayload) => {
        out.typedData.push(payload);
        return evmSignStrategy.signTypedData(wallet.privateKey, payload);
      },
    }),
  } as unknown as SignerResolver;
  const fetcher = seller(
    {
      scheme: "exact",
      network: "eip155:56",
      amount: ONE_E18,
      asset,
      payTo: "0x2222222222222222222222222222222222222222",
      extra: { assetTransferMethod: "permit2", name: "x", version: "1" },
    },
    out,
  );
  try {
    out.result = await new X402PaymentClient(signers, fetcher).pay(
      scope,
      {
        family: "evm",
        chainId: "56",
        id: "eip155:56",
        httpEndpoint: "https://rpc.example",
      } as NetworkDescriptor,
      { url: "https://seller.example", method: "GET", headers: [], ...input },
    );
  } catch (error) {
    out.error = error as { code?: string };
  }
  return out;
}

async function payTron(amount: string, input: Partial<X402PayInput>): Promise<Outcome> {
  const key = Wallet.createRandom().privateKey;
  const address = TronWeb.address.fromPrivateKey(key.slice(2)) as string;
  // Permit2 already holds an allowance, so no approve is built.
  vi.spyOn(providers.HttpProvider.prototype, "request").mockImplementation(async (path) => {
    if (path === "wallet/triggerconstantcontract")
      return { result: { result: true }, constant_result: ["f".repeat(64)] };
    throw new Error(`unexpected RPC ${String(path)}`);
  });
  const out: Outcome = { typedData: [], txs: [], requests: 0, paidRequests: 0 };
  const signers = {
    assertCanSign() {},
    prepare() {},
    resolve: () => ({
      address,
      kind: "software",
      sign: async (tx: unknown) => {
        out.txs.push(tx);
        return tronSignStrategy.sign(key, tx as never);
      },
      signTypedData: async (payload: TypedDataPayload) => {
        out.typedData.push(payload);
        return tronSignStrategy.signTypedData(key, payload);
      },
    }),
  } as unknown as SignerResolver;
  const fetcher = seller(
    {
      scheme: "exact",
      network: "tron:0x2b6653dc",
      amount,
      asset: TRON_USDT,
      payTo: "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ",
      extra: { assetTransferMethod: "permit2" },
    },
    out,
  );
  try {
    out.result = await new X402PaymentClient(signers, fetcher).pay(
      scope,
      {
        id: "tron:728126428",
        chainId: "728126428",
        family: "tron",
        httpEndpoint: "http://127.0.0.1:1",
      } as NetworkDescriptor,
      { url: "https://seller.example", method: "GET", headers: [], ...input },
    );
  } catch (error) {
    out.error = error as { code?: string };
  }
  return out;
}

function expectRefusedBeforeSigning(out: Outcome) {
  expect(out.error).toMatchObject({
    code: "invalid_option",
    details: { paymentStatus: "not_sent", retryPayment: false },
  });
  expect(out.typedData).toHaveLength(0);
  expect(out.txs).toHaveLength(0);
  expect(out.paidRequests).toBe(0);
}

describe("x402 raw payment limit pinning", () => {
  it("EVM: refuses an unpinned raw limit when the seller names an unregistered token", async () => {
    const out = await payEvm(BSC_BTCB, { maxRawAmount: ONE_E18 });
    expectRefusedBeforeSigning(out);
  });

  it("EVM: refuses an unpinned raw limit in --dry-run as well", async () => {
    const out = await payEvm(BSC_BTCB, { maxRawAmount: ONE_E18, dryRun: true });
    expect(out.error).toMatchObject({ code: "invalid_option" });
    expect(out.result).toBeUndefined();
  });

  it("TRON: refuses a raw limit sized for USDD when the seller asks 1e12 raw USDT", async () => {
    const out = await payTron("1000000000000", { maxRawAmount: ONE_E18 });
    expectRefusedBeforeSigning(out);
  });

  it.each([{ token: "USDT" }, { asset: BSC_USDT }])(
    "EVM: pays an honest route with a raw limit pinned by %j and reports what it paid",
    async (pin) => {
      const out = await payEvm(BSC_USDT, { maxRawAmount: ONE_E18, ...pin });
      expect(out.error).toBeUndefined();
      expect(out.typedData).toHaveLength(1);
      expect(out.paidRequests).toBe(1);
      expect(out.result).toMatchObject({
        delivered: true,
        payment: {
          asset: BSC_USDT,
          token: "USDT",
          decimals: 18,
          amount: "1",
          rawAmount: ONE_E18,
        },
      });
    },
  );

  it.each([{ token: "USDT" }, { asset: TRON_USDT }])(
    "TRON: pays an honest route with a raw limit pinned by %j and reports what it paid",
    async (pin) => {
      const out = await payTron("1000000", { maxRawAmount: "1000000", ...pin });
      expect(out.error).toBeUndefined();
      expect(out.typedData).toHaveLength(1);
      expect(out.paidRequests).toBe(1);
      expect(out.result).toMatchObject({
        delivered: true,
        payment: {
          asset: TRON_USDT,
          token: "USDT",
          decimals: 6,
          amount: "1",
          rawAmount: "1000000",
        },
      });
    },
  );

  it("still refuses a pinned token's route priced above the raw limit", async () => {
    const out = await payTron("1000000000000", { maxRawAmount: "1000000", token: "USDT" });
    expect(out.error).toMatchObject({ code: "amount_exceeds_limit" });
    expect(out.typedData).toHaveLength(0);
  });

  it("reports an unregistered pinned asset by address and raw amount only", async () => {
    const out = await payEvm(BSC_BTCB, { maxRawAmount: ONE_E18, asset: BSC_BTCB });
    expect(out.error).toBeUndefined();
    expect(out.result?.payment).toEqual({ asset: BSC_BTCB, rawAmount: ONE_E18 });
  });
});
