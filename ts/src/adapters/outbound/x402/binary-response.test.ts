import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { X402PaymentClient } from "./payment-client.js";
import type { NetworkDescriptor, Signer } from "../../../domain/types/index.js";
import type { SignerResolver } from "../../../application/services/signer/index.js";
import { CliError } from "../../../domain/errors/index.js";

const net = { id: "eip155:56", family: "evm", chainId: "56" } as NetworkDescriptor;
const signer = {
  kind: "software",
  address: "0x1111111111111111111111111111111111111111",
} as Signer;
const scope = { activeAccount: "payer", timeoutMs: 1000, emit() {} } as never;
const input = { url: "https://api.example/resource", method: "GET", headers: [] };
const transaction = "0x" + "a".repeat(64);
const receipt = { success: true, network: net.id, transaction };
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

function harness(
  bytes: Uint8Array,
  contentType?: string,
  mode: "free" | "settled" | "unknown" = "free",
) {
  const headers = new Headers();
  if (contentType) headers.set("content-type", contentType);
  if (mode === "settled")
    headers.set("payment-response", Buffer.from(JSON.stringify(receipt)).toString("base64"));
  const fetcher = vi.fn<typeof fetch>(async () => new Response(new Uint8Array(bytes), { headers }));
  const resolver = {
    assertCanSign: vi.fn(),
    resolve: vi.fn(() => signer),
  } as unknown as SignerResolver;
  const client =
    mode === "free"
      ? new X402PaymentClient(resolver, fetcher)
      : new X402PaymentClient(resolver, globalThis.fetch, async () => fetcher);
  return { client, fetcher, resolver };
}

async function rejection(promise: Promise<unknown>): Promise<CliError> {
  const result = await promise.catch((error: unknown) => error);
  expect(result).toBeInstanceOf(CliError);
  return result as CliError;
}

describe("x402 response bytes", () => {
  it.each([
    "application/octet-stream",
    "image/png",
    "audio/mpeg",
    "video/mp4",
    "application/pdf",
    "application/zip",
  ])("requires --out for %s even when the bytes are valid UTF-8", async (contentType) => {
    const { client, fetcher, resolver } = harness(
      new TextEncoder().encode("binary content"),
      contentType,
    );
    const error = await rejection(client.pay(scope, net, input));
    expect(error).toMatchObject({
      code: "invalid_option",
      kind: "usage",
      details: { paymentStatus: "not_sent", retryPayment: false },
    });
    expect(error.exitCode()).toBe(2);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it.each(["free", "settled", "unknown"] as const)(
    "rejects binary without --out and preserves %s payment status",
    async (mode) => {
      const { client, fetcher } = harness(
        Uint8Array.from([0, 255, 1, 254]),
        "application/octet-stream",
        mode,
      );
      const error = await rejection(client.pay(scope, net, input));
      expect(error).toMatchObject({
        code: "invalid_option",
        kind: "usage",
        details: { paymentStatus: mode === "free" ? "not_sent" : mode, retryPayment: false },
      });
      expect(error.exitCode()).toBe(2);
      if (mode === "settled")
        expect(error.details).toMatchObject({
          phase: "response",
          settled: true,
          txHash: transaction,
          paymentResponse: receipt,
          payer: { address: signer.address },
        });
      expect(error.message).not.toMatch(/rerun|retry with|run again/i);
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );

  it.each(["application/octet-stream", "application/json", "text/plain", undefined])(
    "writes original bytes with --out regardless of encoding (%s)",
    async (contentType) => {
      const bytes = Uint8Array.from([0, 255, 1, 254]);
      const { client } = harness(bytes, contentType, "settled");
      const directory = await mkdtemp(join(tmpdir(), "wallet-cli-response-"));
      directories.push(directory);
      const out = join(directory, "response.bin");
      const result = await client.pay(scope, net, { ...input, out });
      expect(await readFile(out)).toEqual(Buffer.from(bytes));
      expect(result).toMatchObject({
        settled: true,
        paymentResponse: receipt,
        output: { path: out, bytes: 4 },
      });
      expect(result).not.toHaveProperty("response");
    },
  );

  it("writes a UTF-8-compatible binary payload without putting it in the result", async () => {
    const bytes = new TextEncoder().encode("binary\u0000content\r\n");
    const { client } = harness(bytes, "application/octet-stream");
    const directory = await mkdtemp(join(tmpdir(), "wallet-cli-response-"));
    directories.push(directory);
    const out = join(directory, "response.bin");
    const result = await client.pay(scope, net, { ...input, out });
    expect(await readFile(out)).toEqual(Buffer.from(bytes));
    expect(result).toMatchObject({ output: { path: out, bytes: bytes.byteLength } });
    expect(result).not.toHaveProperty("response");
  });

  it("preserves an initial response settlement even without resolving a signer", async () => {
    const { fetcher, resolver } = harness(
      Uint8Array.from([255]),
      "application/octet-stream",
      "settled",
    );
    const client = new X402PaymentClient(resolver, fetcher);
    const error = await rejection(client.pay(scope, net, input));
    expect(error).toMatchObject({
      code: "invalid_option",
      details: {
        paymentStatus: "settled",
        settled: true,
        txHash: transaction,
        retryPayment: false,
      },
    });
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it.each(["free", "unknown"] as const)("keeps %s status on malformed UTF-8", async (mode) => {
    const { client } = harness(Uint8Array.from([255]), "text/plain", mode);
    const error = await rejection(client.pay(scope, net, input));
    expect(error).toMatchObject({
      code: "invalid_x402_response",
      details: { paymentStatus: mode === "free" ? "not_sent" : "unknown", retryPayment: false },
    });
  });

  it.each([
    ["application/json; charset=utf-8", '{"value":"中文"}', { value: "中文" }],
    ["Application/Problem+JSON", '{"value":7}', { value: 7 }],
    ["text/plain", "hello 中文\r\n", "hello 中文\r\n"],
    ["application/xml", "<ok/>", "<ok/>"],
    ["application/vnd.example", "custom text", "custom text"],
    [undefined, "untyped text", "untyped text"],
  ])(
    "preserves supported text/JSON response semantics (%s)",
    async (contentType, text, response) => {
      const { client } = harness(
        new TextEncoder().encode(text as string),
        contentType as string | undefined,
      );
      await expect(client.pay(scope, net, input)).resolves.toMatchObject({
        response,
        settled: false,
      });
    },
  );

  it.each(["application/json", "text/plain", undefined])(
    "rejects malformed UTF-8 without silent replacements (%s)",
    async (contentType) => {
      const bytes = Uint8Array.from([34, 255, 34]);
      const { client } = harness(bytes, contentType, "settled");
      const error = await rejection(client.pay(scope, net, input));
      expect(error).toMatchObject({
        code: "invalid_x402_response",
        details: {
          paymentStatus: "settled",
          settled: true,
          txHash: transaction,
          retryPayment: false,
        },
      });
      expect(error.message).toContain("UTF-8");
      expect(error.exitCode()).toBe(1);
    },
  );
});
