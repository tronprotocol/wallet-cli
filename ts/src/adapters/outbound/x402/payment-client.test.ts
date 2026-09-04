import { describe, expect, it, vi } from "vitest";
import { X402PaymentClient } from "./payment-client.js";
import type { SignerResolver } from "../../../application/services/signer/index.js";
import type { NetworkDescriptor, Signer } from "../../../domain/types/index.js";

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
});
