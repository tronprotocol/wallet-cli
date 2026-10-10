import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandRegistry } from "../registry/index.js";
import { registerX402Commands } from "./x402.js";
import { X402Service } from "../../../../application/use-cases/x402-service.js";
import { X402PaymentClient } from "../../../outbound/x402/payment-client.js";
import { StreamManager } from "../stream/index.js";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import type { SignerResolver } from "../../../../application/services/signer/index.js";

// Replace only the operating-system stdin boundary; exercise the real StreamManager and CLI.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

const network = { id: "eip155:56", family: "evm", chainId: "56" } as NetworkDescriptor;
afterEach(() => vi.restoreAllMocks());

async function stdin(bytes: Buffer<ArrayBuffer>) {
  const actual = await vi.importActual<typeof fs>("node:fs");
  vi.mocked(fs.readFileSync).mockImplementation((file, options) => {
    if (file !== 0) return actual.readFileSync(file, options);
    return options === "utf8" ? bytes.toString("utf8") : bytes;
  });
}

function command(client: X402PaymentClient) {
  const registry = new CommandRegistry();
  registerX402Commands(registry, new X402Service(client, {} as never, {} as never));
  return registry.resolveNeutral(["x402", "pay"])!;
}

function context() {
  return {
    timeoutMs: 1000,
    emit: vi.fn(),
    secrets: { has: () => false },
    streams: new StreamManager("json", false),
  };
}

const samples = [
  ["empty", ""],
  ["ASCII", "68656c6c6f"],
  ["UTF-8", "e4b8ade69687f09f9880"],
  ["CRLF and NUL", "00410d0a4200"],
  ["non-UTF-8", "0041fffe800d0a42"],
] as const;

describe.each(["file", "stdin"])("x402 request bytes from %s", (source) => {
  it.each(samples)("sends original %s bytes to the HTTP endpoint", async (_name, hex) => {
    await sendBody(hex, false);
  });

  it.each(samples)("preserves %s bytes across a controlled 402 retry", async (_name, hex) => {
    await sendBody(hex, true);
  });

  async function sendBody(hex: string, retry: boolean) {
    const bytes = Buffer.from(hex, "hex");
    const directory = await mkdtemp(join(tmpdir(), "x402-body-"));
    const path = join(directory, "body.bin");
    const received: Buffer[] = [];
    const authorization: (string | undefined)[] = [];
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      received.push(Buffer.concat(chunks));
      authorization.push(request.headers["payment-signature"] as string | undefined);
      response.statusCode = retry && received.length === 1 ? 402 : 200;
      response.setHeader("content-type", "text/plain");
      response.end("ok");
    });
    const resolver = {
      assertCanSign: vi.fn(),
      resolve: vi.fn(() => ({ address: "0x1111111111111111111111111111111111111111" })),
    } as unknown as SignerResolver;
    // The injected payment boundary uses a fixed test header; no real signer, RPC or payment.
    const paidFetch: typeof fetch = async (url, init) => {
      const initial = await fetch(url, init);
      if (initial.status !== 402) return initial;
      await initial.arrayBuffer();
      const headers = new Headers(init?.headers);
      headers.set("payment-signature", "test-only");
      return fetch(url, { ...init, headers });
    };
    try {
      await writeFile(path, bytes);
      if (source === "stdin") await stdin(bytes);
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("missing server port");
      const client = new X402PaymentClient(
        resolver,
        globalThis.fetch,
        retry ? async () => paidFetch : undefined,
      );
      await command(client).run(context() as never, network, {
        url: `http://127.0.0.1:${address.port}`,
        method: "POST",
        header: [],
        bodyFile: source === "stdin" ? "-" : path,
      });
      expect(received.map((body) => body.toString("hex"))).toEqual(retry ? [hex, hex] : [hex]);
      expect(authorization).toEqual(retry ? [undefined, "test-only"] : [undefined]);
      if (!retry) expect(resolver.resolve).not.toHaveBeenCalled();
    } finally {
      if (server.listening)
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      await rm(directory, { recursive: true, force: true });
    }
  }

  it.each([1_048_576, 1_048_577])("checks the raw-byte limit for %i bytes", async (length) => {
    // These bytes would triple in size if first decoded to replacement characters.
    const bytes = Buffer.alloc(length, 0xff);
    const directory = await mkdtemp(join(tmpdir(), "x402-body-limit-"));
    const path = join(directory, "body.bin");
    const fetcher = vi.fn(async (_url, init) => {
      expect(await new Response(init?.body).arrayBuffer()).toEqual(bytes.buffer);
      return new Response("ok", { headers: { "content-type": "text/plain" } });
    });
    try {
      await writeFile(path, bytes);
      if (source === "stdin") await stdin(bytes);
      const result = command(new X402PaymentClient({} as never, fetcher)).run(
        context() as never,
        network,
        {
          url: "http://example.test",
          method: "POST",
          header: [],
          bodyFile: source === "stdin" ? "-" : path,
        },
      );
      if (length === 1_048_576) {
        await expect(result).resolves.toMatchObject({ delivered: true });
        expect(fetcher).toHaveBeenCalledOnce();
      } else {
        await expect(result).rejects.toMatchObject({ code: "invalid_value" });
        expect(fetcher).not.toHaveBeenCalled();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

it("keeps inline --body as text", async () => {
  const fetcher = vi.fn(async (_url, init) => {
    expect(init?.body).toBe("中文\r\n");
    return new Response("ok");
  });
  await command(new X402PaymentClient({} as never, fetcher)).run(context() as never, network, {
    url: "http://example.test",
    method: "POST",
    header: [],
    body: "中文\r\n",
  });
  expect(fetcher).toHaveBeenCalledOnce();
});

it.each(["text", "bytes"])(
  "consuming stdin as %s prevents either kind of second read",
  async (kind) => {
    await stdin(Buffer.from("0041fffe800d0a42", "hex"));
    const streams = new StreamManager("json", false);
    if (kind === "text") expect(streams.readStdinOnce()).toBe("\0A���\r\nB");
    else expect(streams.readStdinBytesOnce().toString("hex")).toBe("0041fffe800d0a42");
    expect(() => streams.readStdinOnce()).toThrow("stdin already consumed");
    expect(() => streams.readStdinBytesOnce()).toThrow("stdin already consumed");
  },
);
