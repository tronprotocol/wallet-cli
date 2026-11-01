import { barBroadcasts } from "../../../application/services/broadcast-guard.js";
import { X402Service } from "../../../application/use-cases/x402-service.js";
import { describe, expect, it, vi } from "vitest";
import { X402PaymentClient } from "./payment-client.js";
import type { SignerResolver } from "../../../application/services/signer/index.js";
import type { NetworkDescriptor, Signer } from "../../../domain/types/index.js";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { errorEnvelope } from "../../inbound/cli/output/errors.js";
import {
  CommandDeadline,
  requestDispatchCheck,
} from "../../../application/services/command-deadline.js";

const NO_CHECK = requestDispatchCheck(new CommandDeadline(0));

const signer = {
  kind: "software",
  address: "0x1111111111111111111111111111111111111111",
} as Signer;
const resolver = {
  assertCanSign: vi.fn(),
  resolve: vi.fn(() => signer),
} as unknown as SignerResolver;
const net = {
  id: "eip155:56",
  family: "evm",
  chainId: "56",
  httpEndpoint: "https://rpc.example",
} as NetworkDescriptor;
const scope = {
  activeAccount: "acc_1",
  deadline: new CommandDeadline(0),
  emit: vi.fn(),
} as never;

describe("X402PaymentClient", () => {
  it("returns an unprotected response without resolving a wallet signer", async () => {
    const localResolver = {
      assertCanSign: vi.fn(),
      resolve: vi.fn(),
    } as unknown as SignerResolver;
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ free: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = new X402Service(
      new X402PaymentClient(fetcher as typeof fetch),
      localResolver,
      {} as never,
      {} as never,
    );

    await expect(
      client.pay(scope, net, {
        url: "https://api.example/free",
        method: "GET",
        headers: [],
      }),
    ).resolves.toMatchObject({ delivered: true, settled: false, response: { free: true } });
    expect(localResolver.resolve).not.toHaveBeenCalled();
  });

  it("inspects a 402 challenge in dry-run mode without resolving a signer", async () => {
    const localResolver = {
      assertCanSign: vi.fn(),
      resolve: vi.fn(),
    } as unknown as SignerResolver;
    const challenge = {
      x402Version: 2,
      resource: { url: "https://api.example/paid" },
      accepts: [
        {
          scheme: "exact",
          network: "eip155:56",
          amount: "1000000000000000000",
          asset: "0x55d398326f99059fF775485246999027B3197955",
          payTo: "0x1111111111111111111111111111111111111111",
          maxTimeoutSeconds: 300,
          extra: { assetTransferMethod: "permit2" },
        },
      ],
    };
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify(challenge), {
          status: 402,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = new X402Service(
      new X402PaymentClient(fetcher as typeof fetch),
      localResolver,
      {} as never,
      {} as never,
    );

    await expect(
      client.pay(scope, net, {
        url: "https://api.example/paid",
        method: "GET",
        headers: [],
        dryRun: true,
        maxAmount: "1",
      }),
    ).resolves.toMatchObject({
      dryRun: true,
      paymentRequired: true,
      selected: challenge.accepts[0],
    });
    expect(localResolver.resolve).not.toHaveBeenCalled();
  });

  it("uses the selected wallet signer and returns the paid resource body", async () => {
    const paidFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ value: 7 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const factory = vi.fn(async () => paidFetch as typeof fetch);
    const client = new X402Service(
      new X402PaymentClient(challengeFetch, factory),
      resolver,
      {} as never,
      {} as never,
    );

    await expect(
      client.pay(scope, net, {
        url: "https://api.example/paid",
        method: "POST",
        headers: [{ name: "X-Test", value: "yes" }],
        body: "{}",
      }),
    ).resolves.toMatchObject({
      url: "https://api.example/paid",
      status: 200,
      delivered: true,
      response: { value: 7 },
      payer: { address: signer.address },
    });
    expect(resolver.assertCanSign).toHaveBeenCalledWith("acc_1", "evm");
    expect(factory).toHaveBeenCalledWith(
      net,
      {
        address: signer.address,
        signTypedData: expect.any(Function),
        signTransaction: expect.any(Function),
        signPermit2Approval: expect.any(Function),
      },
      scope,
    );
  });

  it("refuses to pay while broadcasting is barred, before any signing or paid request", async () => {
    const paidFetch = vi.fn(async () => new Response("paid"));
    const factory = vi.fn(async () => paidFetch as typeof fetch);
    const client = new X402Service(
      new X402PaymentClient(challengeFetch, factory),
      resolver,
      {} as never,
      {} as never,
    );

    await barBroadcasts("x402 pay --dry-run", async () => {
      await expect(
        client.pay(scope, net, { url: "https://api.example/paid", method: "GET", headers: [] }),
      ).rejects.toMatchObject({ code: "dry_run_violation" });
    });
    expect(factory).not.toHaveBeenCalled();
    expect(paidFetch).not.toHaveBeenCalled();
  });

  it("rejects a header the x402 client manages before making a request", async () => {
    const factory = vi.fn();
    const client = new X402Service(
      new X402PaymentClient(challengeFetch, factory),
      resolver,
      {} as never,
      {} as never,
    );
    await expect(
      client.pay(scope, net, {
        url: "https://api.example/paid",
        method: "GET",
        headers: [{ name: "Payment-Signature", value: "forged" }],
      }),
    ).rejects.toMatchObject({ code: "invalid_option" });
    expect(factory).not.toHaveBeenCalled();
  });

  it("writes response bytes to a new output file without putting the body in the result", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wallet-cli-x402-out-"));
    const output = join(directory, "response.bin");
    const paidFetch = vi.fn(
      async () =>
        new Response(Uint8Array.from([0, 1, 2, 255]), {
          status: 200,
          headers: { "content-type": "application/octet-stream" },
        }),
    );
    const client = new X402Service(
      new X402PaymentClient(
        challengeFetch,
        vi.fn(async () => paidFetch as typeof fetch),
      ),
      resolver,
      {} as never,
      {} as never,
    );

    const result = await client.pay(scope, net, {
      url: "https://api.example/file",
      method: "GET",
      headers: [],
      out: output,
    });
    expect([...(await readFile(output))]).toEqual([0, 1, 2, 255]);
    expect(result).toMatchObject({ output: { path: output, bytes: 4 } });
    expect(result).not.toHaveProperty("response");
    await expect(
      client.pay(scope, net, {
        url: "https://api.example/file",
        method: "GET",
        headers: [],
        out: output,
      }),
    ).rejects.toMatchObject({ code: "output_exists" });
  });

  it.each(["exists", "io"])(
    "refuses an unusable output file (%s) before sending any request or signing",
    async (mode) => {
      const directory = await mkdtemp(join(tmpdir(), "wallet-cli-x402-out-"));
      const output = join(directory, mode === "io" ? "missing/taken.bin" : "taken.bin");
      if (mode === "exists") await writeFile(output, "keep me");
      const fetcher = vi.fn();
      const paidFetch = vi.fn();
      const localResolver = { assertCanSign: vi.fn(), resolve: vi.fn(() => signer) } as never;
      const client = new X402Service(
        new X402PaymentClient(
          fetcher as typeof fetch,
          vi.fn(async () => paidFetch as typeof fetch),
        ),
        localResolver,
        {} as never,
        {} as never,
      );
      await expect(
        client.pay(scope, net, {
          url: "https://api.example/file",
          method: "GET",
          headers: [],
          out: output,
        }),
      ).rejects.toMatchObject({
        code: mode === "exists" ? "output_exists" : "io_error",
        details: { paymentStatus: "not_sent" },
      });
      expect(fetcher).not.toHaveBeenCalled();
      expect(paidFetch).not.toHaveBeenCalled();
      if (mode === "exists") expect(await readFile(output, "utf8")).toBe("keep me");
      await rm(directory, { recursive: true });
    },
  );

  it("releases the reserved output file when the request fails before anything is delivered", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wallet-cli-x402-out-"));
    const output = join(directory, "response.bin");
    const fetcher = vi.fn(async () => {
      throw new Error("connection refused");
    });
    const client = new X402Service(
      new X402PaymentClient(fetcher as typeof fetch),
      resolver,
      {} as never,
      {} as never,
    );
    await expect(
      client.pay(scope, net, {
        url: "https://api.example/file",
        method: "GET",
        headers: [],
        out: output,
      }),
    ).rejects.toBeTruthy();
    await expect(readFile(output)).rejects.toMatchObject({ code: "ENOENT" });
    await rm(directory, { recursive: true });
  });
});

it.each([
  [{ success: true, transaction: "0x" + "a".repeat(64), network: "eip155:56" }, true],
  [{ success: true, transaction: "", network: "eip155:56" }, false],
  [{ success: true, transaction: "0x" + "a".repeat(64), network: "eip155:8453" }, false],
  [{ transaction: "0x" + "a".repeat(64), network: "eip155:56" }, false],
  [
    { success: false, errorReason: "insufficient_funds", transaction: "", network: "eip155:8453" },
    false,
  ],
  [{ success: "false", transaction: "", network: "eip155:56" }, false],
])("only marks a successful matching settlement as settled (%j)", async (header, settled) => {
  const client = new X402Service(
    new X402PaymentClient(
      async () =>
        new Response("{}", {
          status: 502,
          headers: {
            "content-type": "application/json",
            "payment-response": Buffer.from(JSON.stringify(header)).toString("base64"),
          },
        }),
    ),
    resolver,
    {} as never,
    {} as never,
  );
  const pending = client.pay(scope, net, {
    url: "https://example.test",
    method: "GET",
    headers: [],
  });
  if (settled) await expect(pending).resolves.toMatchObject({ settled: true, delivered: false });
  else
    await expect(pending).rejects.toMatchObject({
      code: "invalid_settlement",
      details: { retryPayment: false, settled: false, delivered: false },
    });
});
it.each([
  ["insufficient_funds", "insufficient_balance"],
  ["transaction_failed", "provider_error"],
  ["SECRET provider diagnostic", "provider_error"],
])("classifies a failed settlement receipt with reason %s", async (reason, code) => {
  const transaction = "0x" + "a".repeat(64);
  for (const status of [200, 502]) {
    for (const header of ["payment-response", "x-payment-response"]) {
      const client = new X402Service(
        new X402PaymentClient(
          async () =>
            new Response("not JSON", {
              status,
              headers: {
                [header]: Buffer.from(
                  JSON.stringify({
                    success: false,
                    errorReason: reason,
                    transaction,
                    network: "eip155:56",
                  }),
                ).toString("base64"),
              },
            }),
        ),
        resolver,
        {} as never,
        {} as never,
      );
      const error = await client
        .pay(scope, net, {
          url: "https://example.test",
          method: "GET",
          headers: [],
        })
        .catch((error: unknown) => error);
      expect(error).toMatchObject({
        code,
        details: {
          phase: "settle",
          httpStatus: status,
          settled: false,
          delivered: status === 200,
          retryPayment: false,
          paymentStatus: "unknown",
          candidateTxHash: transaction,
          ...(reason === "insufficient_funds" ? { reason } : {}),
        },
      });
      expect(JSON.stringify(error)).not.toContain("SECRET");
    }
  }
});

it("classifies a failed settlement without a transaction hash", async () => {
  const client = new X402Service(
    new X402PaymentClient(
      async () =>
        new Response("{}", {
          status: 502,
          headers: {
            "payment-response": Buffer.from(
              JSON.stringify({
                success: false,
                errorReason: "insufficient_funds",
                transaction: "",
                network: "eip155:56",
              }),
            ).toString("base64"),
          },
        }),
    ),
    resolver,
    {} as never,
    {} as never,
  );
  await expect(
    client.pay(scope, net, {
      url: "https://example.test",
      method: "GET",
      headers: [],
    }),
  ).rejects.toMatchObject({ code: "insufficient_balance" });
});
it("bounds oversized 402 bodies before the SDK or signer handles them", async () => {
  let pulled = 0;
  const cancel = vi.fn();
  const local = { assertCanSign: vi.fn(), resolve: vi.fn() } as unknown as SignerResolver;
  const client = new X402Service(
    new X402PaymentClient(
      async () =>
        new Response(
          new ReadableStream(
            {
              pull(c) {
                pulled++;
                c.enqueue(new Uint8Array(1024 * 1024));
              },
              cancel,
            },
            { highWaterMark: 0 },
          ),
          { status: 402 },
        ),
    ),
    local,
    {} as never,
    {} as never,
  );
  await expect(
    client.pay(scope, net, { url: "https://example.test", method: "GET", headers: [] }),
  ).rejects.toMatchObject({ code: "response_too_large" });
  expect(pulled).toBe(11);
  expect(cancel).toHaveBeenCalledOnce();
  expect(local.resolve).not.toHaveBeenCalled();
});

it("retains settlement when the paid response is malformed JSON", async () => {
  const transaction = "0x" + "a".repeat(64);
  const paidFetch = vi.fn(
    async () =>
      new Response("{", {
        headers: {
          "content-type": "application/json",
          "payment-response": Buffer.from(
            JSON.stringify({
              success: true,
              network: net.id,
              transaction,
              secret: "do-not-copy",
            }),
          ).toString("base64"),
        },
      }),
  );
  const client = new X402Service(
    new X402PaymentClient(challengeFetch, async () => paidFetch),
    resolver,
    {} as never,
    {} as never,
  );
  const error = await client
    .pay(scope, net, { url: "https://api.example/paid", method: "GET", headers: [] })
    .catch((error) => error);
  expect(error).toMatchObject({
    code: "invalid_x402_response",
    details: {
      paymentStatus: "settled",
      retryPayment: false,
      txHash: transaction,
      settled: true,
      paymentResponse: { success: true, network: net.id, transaction },
      payer: { address: signer.address },
    },
  });
  expect(JSON.stringify(error)).not.toContain("do-not-copy");
  expect(paidFetch).toHaveBeenCalledOnce();
});

it.each([
  [
    "Failed to create payment payload: Insufficient balance in GasFree wallet SECRET.",
    "gasfree_insufficient_balance",
    "not_sent",
  ],
  [
    "Failed to create payment payload: GasFree account for SECRET is not activated.",
    "gasfree_not_activated",
    "not_sent",
  ],
  [
    "Failed to create payment payload: approval_reset_required",
    "approval_reset_required",
    "unknown",
  ],
  [
    "Failed to create payment payload: permit2_allowance_required: SECRET",
    "permit2_allowance_required",
    "unknown",
  ],
  ["Failed to create payment payload: SECRET", "provider_error", "unknown"],
])("classifies SDK failures without echoing secrets: %s", async (message, code, paymentStatus) => {
  const paidFetch = vi.fn(async () => {
    throw new Error(message);
  });
  const client = new X402Service(
    new X402PaymentClient(challengeFetch, async () => paidFetch),
    resolver,
    {} as never,
    {} as never,
  );
  const error = await client
    .pay(scope, net, { url: "https://api.example/paid", method: "GET", headers: [] })
    .catch((error) => error);
  expect(error).toMatchObject({ code, details: { paymentStatus, retryPayment: false } });
  expect(JSON.stringify(errorEnvelope(error))).not.toContain("SECRET");
  expect(paidFetch).toHaveBeenCalledOnce();
});

it("retains settlement when reading the paid body exceeds its limit", async () => {
  const transaction = "0x" + "b".repeat(64);
  const response = new Response("x", {
    headers: {
      "content-length": String(11 * 1024 * 1024),
      "payment-response": Buffer.from(
        JSON.stringify({ success: true, network: net.id, transaction }),
      ).toString("base64"),
    },
  });
  const client = new X402Service(
    new X402PaymentClient(challengeFetch, async () => async () => response),
    resolver,
    {} as never,
    {} as never,
  );
  await expect(
    client.pay(scope, net, { url: "https://api.example/paid", method: "GET", headers: [] }),
  ).rejects.toMatchObject({
    code: "response_too_large",
    details: { txHash: transaction, paymentStatus: "settled", retryPayment: false },
  });
});

it.each(["verify", "settle"])(
  "exposes a sanitized facilitator failure in phase %s",
  async (phase) => {
    const client = new X402Service(
      new X402PaymentClient(
        challengeFetch,
        async () => async () =>
          Response.json(
            { phase, code: "permit2_allowance_required", error: "SECRET" },
            { status: 502 },
          ),
      ),
      resolver,
      {} as never,
      {} as never,
    );
    const error = await client
      .pay(scope, net, { url: "https://api.example/paid", method: "GET", headers: [] })
      .catch((error) => error);
    expect(error).toMatchObject({
      code: "permit2_allowance_required",
      details: { phase, paymentStatus: "unknown", retryPayment: false },
    });
    expect(JSON.stringify(errorEnvelope(error))).not.toContain("SECRET");
  },
);

it("retains safe failed-settlement evidence from the local paywall without marking it paid", async () => {
  const client = new X402Service(
    new X402PaymentClient(
      challengeFetch,
      async () => async () =>
        Response.json(
          {
            phase: "settle",
            reason: "invalid_transaction_state",
            candidateTxHash: "a".repeat(64),
            candidateNetwork: "tron:0x2b6653dc",
            httpStatus: 503,
            error: "SECRET",
          },
          { status: 502 },
        ),
    ),
    resolver,
    {} as never,
    {} as never,
  );
  const error = await client
    .pay(scope, net, { url: "https://api.example/paid", method: "GET", headers: [] })
    .catch((error) => error);
  expect(error).toMatchObject({
    code: "provider_error",
    details: {
      phase: "settle",
      reason: "invalid_transaction_state",
      candidateTxHash: "a".repeat(64),
      paymentStatus: "unknown",
      httpStatus: 503,
      retryPayment: false,
    },
  });
  expect(JSON.stringify(errorEnvelope(error))).not.toContain("SECRET");
});

it.each(["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "SECRET"])(
  "preserves only safe paywall transport codes: %s",
  async (transportCode) => {
    const client = new X402Service(
      new X402PaymentClient(
        challengeFetch,
        async () => async () =>
          Response.json(
            { phase: "settle", reason: "connection_failed", transportCode, error: "SECRET" },
            { status: 502 },
          ),
      ),
      resolver,
      {} as never,
      {} as never,
    );
    const error = await client
      .pay(scope, net, { url: "https://api.example/paid", method: "GET", headers: [] })
      .catch((error) => error);
    expect(error).toMatchObject({
      code: "provider_error",
      details: {
        phase: "settle",
        reason: "connection_failed",
        paymentStatus: "unknown",
        retryPayment: false,
      },
    });
    if (transportCode === "SECRET") expect(error.details).not.toHaveProperty("transportCode");
    else expect(error.details.transportCode).toBe(transportCode);
    expect(JSON.stringify(errorEnvelope(error))).not.toContain("SECRET");
  },
);

it.each([
  [500, { error: "unknown failure" }, "provider_error"],
  [500, { error: "facilitator /settle failed with HTTP 429" }, "provider_rate_limited"],
  [429, {}, "provider_rate_limited"],
] as const)("fails initial HTTP %s without signing or retrying", async (status, body, code) => {
  const fetcher = vi.fn(async () => Response.json(body, { status }));
  const resolve = vi.fn();
  const client = new X402Service(
    new X402PaymentClient(fetcher),
    { resolve } as unknown as SignerResolver,
    {} as never,
    {} as never,
  );
  await expect(
    client.pay(scope, net, { url: "https://example.test/a", method: "GET", headers: [] }),
  ).rejects.toMatchObject({
    code,
    details: { httpStatus: status, retryPayment: false, settled: false, delivered: false },
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(resolve).not.toHaveBeenCalled();
});
it.each(["tron:3448148188", "tron:0xcd8690dc"])(
  "matches incoming %s without changing chain identity",
  async (network) => {
    const client = new X402Service(
      new X402PaymentClient(async () =>
        Response.json(
          { accepts: [{ network, scheme: "exact", amount: "1", asset: "unknown" }] },
          { status: 402 },
        ),
      ),
      resolver,
      {} as never,
      {} as never,
    );
    await expect(
      client.pay(
        scope,
        { id: "tron:3448148188", family: "tron", chainId: "3448148188" } as NetworkDescriptor,
        { url: "https://example.test", method: "GET", headers: [], dryRun: true },
      ),
    ).resolves.toMatchObject({ selected: { network: "tron:3448148188" } });
    await expect(
      client.pay(
        scope,
        { id: "tron:728126428", family: "tron", chainId: "728126428" } as NetworkDescriptor,
        { url: "https://example.test", method: "GET", headers: [], dryRun: true },
      ),
    ).rejects.toMatchObject({ code: "no_matching_requirement" });
  },
);

it.each([
  [{ maxRawAmount: "99", token: "USDT" }, "amount_exceeds_limit"],
  [{ maxAmount: "0.000000000000000099" }, "amount_exceeds_limit"],
  [{ token: "USDD" }, "no_matching_requirement"],
  [{ scheme: "exact_gasfree" as const }, "no_matching_requirement"],
])("rejects unsatisfied payment requirements before signing: %j", async (input, code) => {
  const resolve = vi.fn();
  const fetcher = vi.fn(async () =>
    Response.json(
      {
        x402Version: 2,
        resource: { url: "https://api.example/pay" },
        accepts: [
          {
            scheme: "exact",
            network: "eip155:56",
            asset: "0x55d398326f99059fF775485246999027B3197955",
            amount: "100",
            payTo: signer.address,
            maxTimeoutSeconds: 300,
          },
        ],
      },
      { status: 402 },
    ),
  );
  const client = new X402Service(
    new X402PaymentClient(fetcher),
    { resolve, assertCanSign: vi.fn() } as unknown as SignerResolver,
    {} as never,
    {} as never,
  );
  await expect(
    client.pay(scope, net, {
      url: "https://api.example/pay",
      method: "GET",
      headers: [],
      ...input,
    }),
  ).rejects.toMatchObject({ code, details: { paymentStatus: "not_sent", retryPayment: false } });
  expect(resolve).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each([
  {},
  { expectedPayTo: signer.address },
  { exactAmount: "0.000000000000000001" },
  {
    expectedPayTo: signer.address,
    exactAmount: "0.000000000000000001",
  },
])("never enters an injected paid-fetch factory during inspection (%j)", async (constraints) => {
  const factory = vi.fn(async () => async () => new Response("paid"));
  const fetcher = vi.fn(async () =>
    Response.json(
      {
        accepts: [
          {
            scheme: "exact",
            network: net.id,
            amount: "1",
            asset: "0x55d398326f99059fF775485246999027B3197955",
            payTo: signer.address,
          },
        ],
      },
      { status: 402 },
    ),
  );
  const local = {
    assertCanSign: vi.fn(),
    resolve: vi.fn(() => signer),
  } as unknown as SignerResolver;
  const client = new X402Service(
    new X402PaymentClient(fetcher, factory),
    local,
    {} as never,
    {} as never,
  );
  await expect(
    client.pay(scope, net, {
      url: "https://example.test",
      method: "GET",
      headers: [],
      dryRun: true,
      ...constraints,
    }),
  ).resolves.toMatchObject({ dryRun: true, paymentRequired: true });
  expect(factory).not.toHaveBeenCalled();
  expect(local.resolve).not.toHaveBeenCalled();
});

function challengeFetch(): Promise<Response> {
  return Promise.resolve(
    Response.json(
      {
        accepts: [
          {
            scheme: "exact",
            network: net.id,
            amount: "1",
            asset: "0x55d398326f99059fF775485246999027B3197955",
            payTo: signer.address,
          },
        ],
      },
      { status: 402 },
    ),
  );
}

it("does not resolve or prepare a payer or invoke a paid factory for a free response", async () => {
  const sign = vi.fn();
  const local = {
    prepare: vi.fn(),
    assertCanSign: vi.fn(),
    resolve: vi.fn(() => ({ address: signer.address, sign })),
  };
  const factory = vi.fn();
  const fetcher = vi.fn(async () => new Response("free"));
  const service = new X402Service(
    new X402PaymentClient(fetcher, factory),
    local as unknown as SignerResolver,
    {} as never,
    {} as never,
  );
  await expect(
    service.pay(scope, net, { url: "https://example.test", method: "GET", headers: [] }),
  ).resolves.toMatchObject({ response: "free", settled: false });
  expect(local.prepare).not.toHaveBeenCalled();
  expect(local.assertCanSign).not.toHaveBeenCalled();
  expect(local.resolve).not.toHaveBeenCalled();
  expect(sign).not.toHaveBeenCalled();
  expect(factory).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledOnce();
});

it.each(["preview", "payer-failure", "payment-failure"])(
  "releases the challenge output reservation after %s",
  async (mode) => {
    const directory = await mkdtemp(join(tmpdir(), "x402-challenge-out-"));
    const out = join(directory, "response.bin");
    const factory = vi.fn(async () => {
      throw new Error("payment failed");
    });
    const local = {
      assertCanSign: vi.fn(),
      resolve: vi.fn(() => {
        if (mode === "payer-failure") throw new Error("cannot resolve payer");
        return signer;
      }),
    } as unknown as SignerResolver;
    const service = new X402Service(
      new X402PaymentClient(challengeFetch, factory),
      local,
      {} as never,
      {} as never,
    );
    try {
      const result = service.pay(scope, net, {
        url: "https://example.test",
        method: "GET",
        headers: [],
        out,
        dryRun: mode === "preview",
      });
      if (mode === "preview") await expect(result).resolves.toMatchObject({ dryRun: true });
      else
        await expect(result).rejects.toMatchObject({
          details: {
            paymentStatus: mode === "payment-failure" ? "unknown" : "not_sent",
            retryPayment: false,
          },
        });
      await expect(readFile(out)).rejects.toMatchObject({ code: "ENOENT" });
      expect(factory).toHaveBeenCalledTimes(mode === "payment-failure" ? 1 : 0);
    } finally {
      await rm(directory, { recursive: true });
    }
  },
);

describe("settlement receipt normalization", () => {
  const receiptResponse = (receipt: unknown) => async () =>
    new Response("{}", {
      status: 200,
      headers: {
        "content-type": "application/json",
        "payment-response": Buffer.from(JSON.stringify(receipt)).toString("base64"),
      },
    });

  const ok = { success: true, network: "eip155:56", transaction: "0x" + "a".repeat(64) };
  it.each([
    [
      { ...ok, payer: signer.address, extra: 1 },
      { ...ok, payer: signer.address },
    ],
    [ok, ok],
    [
      { ...ok, payer: 123 },
      { ...ok, payer: "123" },
    ],
    [
      { ...ok, payer: null },
      { ...ok, payer: "null" },
    ],
  ])("reads %j as %j and keeps the raw receipt for display", async (receipt, settlement) => {
    const resource = await new X402PaymentClient(receiptResponse(receipt) as never).request(
      scope,
      net,
      { url: "https://api.example/free", method: "GET", headers: [] },
      NO_CHECK,
    );
    expect(resource).toMatchObject({ kind: "response", result: { paymentResponse: receipt } });
    expect(resource.kind === "response" && resource.result.settlement).toEqual(settlement);
  });
});
