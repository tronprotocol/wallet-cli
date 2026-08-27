import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { TronRpcClient } from "./tron.js";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";

/**
 * A network `apiKey` travels as a request HEADER. `FetchHttpTransport` refuses to follow redirects
 * whenever it carries one, because fetch re-sends headers to the redirect target — handing the
 * credential to whoever the configured endpoint points at.
 *
 * tronweb does NOT use that transport: it builds its own axios instance, and axios follows
 * redirects by default. These tests pin the guard on that path by asserting what the redirect
 * TARGET received, not by asserting a config value that a tronweb upgrade could quietly ignore.
 */
const API_KEY = "test-credential-value";

let servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  servers = [];
});

function listen(handler: Parameters<typeof createServer>[1]): Promise<number> {
  const server = createServer(handler);
  servers.push(server);
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)),
  );
}

/** a redirecting endpoint plus the target it points at; the target records what reached it. */
async function redirectPair() {
  const received: Array<Record<string, unknown>> = [];
  const targetPort = await listen((req, res) => {
    received.push(req.headers as Record<string, unknown>);
    req.resume();
    res.setHeader("content-type", "application/json");
    res.end("{}");
  });
  const sourcePort = await listen((req, res) => {
    req.resume();
    res.writeHead(302, { location: `http://127.0.0.1:${targetPort}${req.url}` });
    res.end();
  });
  return { received, endpoint: `http://127.0.0.1:${sourcePort}` };
}

function network(endpoint: string, credentialed: boolean): NetworkDescriptor {
  return {
    id: "tron:nile",
    family: "tron",
    chainId: "nile",
    nativeSymbol: "TRX",
    capabilities: [],
    httpEndpoint: endpoint,
    ...(credentialed ? { apiKeyHeader: "TRON-PRO-API-KEY", apiKey: API_KEY } : {}),
  } as NetworkDescriptor;
}

describe("TronRpcClient does not leak an API key through a redirect", () => {
  it("refuses to follow a redirect on the tronweb path when a credential header is set", async () => {
    const { received, endpoint } = await redirectPair();
    const client = new TronRpcClient(network(endpoint, true), 5_000);

    await expect(client.getAccountResources("TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB")).rejects.toBeTruthy();

    expect(received).toHaveLength(0);
  });

  it("refuses to follow a redirect on the raw transport path too", async () => {
    const { received, endpoint } = await redirectPair();
    const client = new TronRpcClient(network(endpoint, true), 5_000);

    await expect(client.getAccount("TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB")).rejects.toBeTruthy();

    expect(received).toHaveLength(0);
  });

  // The guard is deliberately conditional: with no credential there is nothing to leak, and a
  // provider that legitimately redirects must keep working. Without this, a passing suite could
  // just mean redirects are broken everywhere.
  it("still follows a redirect when no credential is configured", async () => {
    const { received, endpoint } = await redirectPair();
    const client = new TronRpcClient(network(endpoint, false), 5_000);

    await client.getAccountResources("TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB").catch(() => undefined);

    expect(received.length).toBeGreaterThan(0);
    expect(JSON.stringify(received)).not.toContain(API_KEY);
  });
});
