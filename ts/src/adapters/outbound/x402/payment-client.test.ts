import { describe, expect, it, vi } from "vitest";
import { X402PaymentClient } from "./payment-client.js";
import type { SignerResolver } from "../../../application/services/signer/index.js";
import type { NetworkDescriptor, Signer } from "../../../domain/types/index.js";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
  timeoutMs: 1000,
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
    const client = new X402PaymentClient(localResolver, fetcher as typeof fetch);

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
    const client = new X402PaymentClient(localResolver, fetcher as typeof fetch);

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
    const client = new X402PaymentClient(resolver, globalThis.fetch, factory);

    await expect(
      client.pay(scope, net, {
        url: "https://api.example/paid",
        method: "POST",
        headers: ["X-Test: yes"],
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
    expect(factory).toHaveBeenCalledWith(net, signer, scope);
  });

  it("rejects malformed headers before making a request", async () => {
    const factory = vi.fn();
    const client = new X402PaymentClient(resolver, globalThis.fetch, factory);
    await expect(
      client.pay(scope, net, {
        url: "https://api.example/paid",
        method: "GET",
        headers: ["not-a-header"],
      }),
    ).rejects.toMatchObject({ code: "invalid_value" });
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
    const client = new X402PaymentClient(
      resolver,
      globalThis.fetch,
      vi.fn(async () => paidFetch as typeof fetch),
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
});

it.each([
  [
    { success: false, errorReason: "transaction_failed", transaction: "", network: "eip155:56" },
    false,
  ],
  [{ success: true, transaction: "0x" + "a".repeat(64), network: "eip155:56" }, true],
  [{ success: true, transaction: "", network: "eip155:56" }, false],
  [{ success: true, transaction: "0x" + "a".repeat(64), network: "eip155:8453" }, false],
  [{ transaction: "0x" + "a".repeat(64), network: "eip155:56" }, false],
])("only marks a successful matching settlement as settled (%j)", async (header, settled) => {
  const client = new X402PaymentClient(
    resolver,
    async () =>
      new Response("{}", {
        status: 502,
        headers: {
          "content-type": "application/json",
          "payment-response": Buffer.from(JSON.stringify(header)).toString("base64"),
        },
      }),
  );
  await expect(
    client.pay(scope, net, { url: "https://example.test", method: "GET", headers: [] }),
  ).resolves.toMatchObject({ settled, delivered: false });
});
it("bounds oversized 402 bodies before the SDK or signer handles them", async () => {
  let pulled = 0;
  const cancel = vi.fn();
  const local = { assertCanSign: vi.fn(), resolve: vi.fn() } as unknown as SignerResolver;
  const client = new X402PaymentClient(
    local,
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
  );
  await expect(
    client.pay(scope, net, { url: "https://example.test", method: "GET", headers: [] }),
  ).rejects.toMatchObject({ code: "response_too_large" });
  expect(pulled).toBe(11);
  expect(cancel).toHaveBeenCalledOnce();
  expect(local.resolve).not.toHaveBeenCalled();
});
