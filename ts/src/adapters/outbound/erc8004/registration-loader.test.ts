import { lookup } from "node:dns/promises";
import { EventEmitter } from "node:events";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RegistrationLoader } from "./registration-loader.js";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
vi.mock("node:http", () => ({ request: vi.fn() }));
vi.mock("node:https", () => ({ request: vi.fn() }));

const dnsLookup = vi.mocked(lookup);
const httpRequestMock = vi.mocked(httpRequest);
const httpsRequestMock = vi.mocked(httpsRequest);
const fetchMock = vi.fn<typeof fetch>();

function allowPublicDns(): void {
  dnsLookup.mockImplementation(async () => [{ address: "93.184.216.34", family: 4 }] as never);
}

function incomingResponse(
  body: string,
  statusCode = 200,
  headers: IncomingMessage["headers"] = {},
): IncomingMessage {
  const response = Readable.from([Buffer.from(body)]) as IncomingMessage;
  response.statusCode = statusCode;
  response.headers = headers;
  return response;
}

function clientRequest(): ClientRequest {
  const request = new EventEmitter() as ClientRequest;
  request.end = vi.fn();
  return request;
}

function replyHttps(
  body: string,
  statusCode = 200,
  headers: IncomingMessage["headers"] = {},
): void {
  httpsRequestMock.mockImplementationOnce(((
    _url: URL,
    _options: RequestOptions,
    callback: (response: IncomingMessage) => void,
  ) => {
    callback(incomingResponse(body, statusCode, headers));
    return clientRequest();
  }) as typeof httpsRequest);
}

function replyHttp(body: string, statusCode = 200): void {
  httpRequestMock.mockImplementationOnce(((
    _url: URL,
    _options: RequestOptions,
    callback: (response: IncomingMessage) => void,
  ) => {
    callback(incomingResponse(body, statusCode));
    return clientRequest();
  }) as typeof httpRequest);
}

describe("RegistrationLoader", () => {
  beforeEach(() => {
    dnsLookup.mockReset();
    httpRequestMock.mockReset();
    httpsRequestMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("decodes a strict base64 JSON data URI", async () => {
    const encoded = Buffer.from(JSON.stringify({ name: "Ada", active: true })).toString("base64");

    await expect(
      new RegistrationLoader(1_000).load(`data:application/json;base64,${encoded}`),
    ).resolves.toEqual({ metadata: { name: "Ada", active: true } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(httpRequestMock).not.toHaveBeenCalled();
    expect(httpsRequestMock).not.toHaveBeenCalled();
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it.each([
    ["non-base64 data", "data:application/json,%7B%7D"],
    ["invalid base64", "data:application/json;base64,e30"],
    ["non-JSON bytes", "data:application/json;base64,////"],
  ])("rejects %s without transport access", async (_label, uri) => {
    const result = await new RegistrationLoader(1_000).load(uri);

    expect(result.metadata).toBeUndefined();
    expect(result.warning).toMatch(/^Registration metadata /);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(httpRequestMock).not.toHaveBeenCalled();
    expect(httpsRequestMock).not.toHaveBeenCalled();
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it.each([
    ["an array", ["not", "an", "object"]],
    ["null", null],
    ["a scalar", "metadata"],
  ])("requires data metadata to be a JSON object: %s", async (_label, value) => {
    const encoded = Buffer.from(JSON.stringify(value)).toString("base64");

    await expect(
      new RegistrationLoader(1_000).load(`data:application/json;base64,${encoded}`),
    ).resolves.toEqual({ warning: "Registration metadata is not a JSON object" });
  });

  it("loads an HTTP JSON object after resolving the host to a public address", async () => {
    allowPublicDns();
    replyHttps(JSON.stringify({ name: "remote" }), 200, { "content-type": "application/json" });

    await expect(
      new RegistrationLoader(1_000).load("https://metadata.example/agent.json"),
    ).resolves.toEqual({ metadata: { name: "remote" } });
    expect(String(httpsRequestMock.mock.calls[0]![0])).toBe("https://metadata.example/agent.json");
    expect(httpsRequestMock.mock.calls[0]![1]).toEqual(
      expect.objectContaining({
        method: "GET",
        lookup: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("pins the connection to the vetted DNS address", async () => {
    dnsLookup
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }] as never)
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }] as never);
    let requestOptions: RequestOptions | undefined;
    httpsRequestMock.mockImplementation(((
      _url: URL,
      options: RequestOptions,
      callback: (response: IncomingMessage) => void,
    ) => {
      requestOptions = options;
      const response = Readable.from(['{"name":"pinned"}']) as IncomingMessage;
      response.statusCode = 200;
      response.headers = {};
      callback(response);
      const request = new EventEmitter() as ClientRequest;
      request.end = vi.fn();
      return request;
    }) as typeof httpsRequest);
    fetchMock.mockRejectedValue(new Error("unsafe hostname resolution was used"));

    await expect(
      new RegistrationLoader(1_000).load("https://metadata.example/agent.json"),
    ).resolves.toEqual({ metadata: { name: "pinned" } });

    expect(dnsLookup).toHaveBeenCalledTimes(1);
    const pinned = await new Promise<{ address: string; family: number }>((resolve, reject) => {
      requestOptions?.lookup?.("metadata.example", {}, (error, address, family) => {
        if (error) reject(error);
        else resolve({ address: String(address), family: Number(family) });
      });
    });
    expect(pinned).toEqual({ address: "93.184.216.34", family: 4 });
  });

  it("uses the HTTP transport for an allowed http URI", async () => {
    allowPublicDns();
    replyHttp('{"name":"http"}');

    await expect(
      new RegistrationLoader(1_000).load("http://metadata.example/agent.json"),
    ).resolves.toEqual({ metadata: { name: "http" } });
    expect(httpRequestMock).toHaveBeenCalledTimes(1);
    expect(httpsRequestMock).not.toHaveBeenCalled();
  });

  it.each([
    "http://localhost/admin",
    "http://127.0.0.1/admin",
    "http://[::1]/admin",
    "http://[::ffff:127.0.0.1]/admin",
    "http://[fd00::1]/admin",
    "http://[fe80::1]/admin",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.4/private",
  ])("blocks a local or private literal before fetch: %s", async (uri) => {
    await expect(new RegistrationLoader(1_000).load(uri)).resolves.toEqual({
      warning: "Registration metadata URI targets a restricted network address",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(httpRequestMock).not.toHaveBeenCalled();
    expect(httpsRequestMock).not.toHaveBeenCalled();
  });

  it("blocks a host when DNS returns any private address", async () => {
    dnsLookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "192.168.1.20", family: 4 },
    ] as never);

    await expect(
      new RegistrationLoader(1_000).load("https://mixed.example/agent"),
    ).resolves.toEqual({
      warning: "Registration metadata URI targets a restricted network address",
    });
    expect(httpsRequestMock).not.toHaveBeenCalled();
  });

  it.each([
    "file:///etc/passwd",
    "ftp://public.example/agent.json",
    "https://alice:secret@metadata.example/agent.json?token=query-secret",
  ])("rejects an unsafe URI without echoing it: %s", async (uri) => {
    const result = await new RegistrationLoader(1_000).load(uri);

    expect(result).toEqual({ warning: "Registration metadata URI is invalid or unsupported" });
    expect(result.warning).not.toContain("secret");
    expect(result.warning).not.toContain("query-secret");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(httpRequestMock).not.toHaveBeenCalled();
    expect(httpsRequestMock).not.toHaveBeenCalled();
  });

  it("maps an IPFS URI through the fixed HTTPS gateway", async () => {
    allowPublicDns();
    replyHttps('{"name":"ipfs"}');

    await expect(
      new RegistrationLoader(1_000).load("ipfs://QmAgentCID/metadata/agent%201.json"),
    ).resolves.toEqual({ metadata: { name: "ipfs" } });
    expect(String(httpsRequestMock.mock.calls[0]![0])).toBe(
      "https://ipfs.io/ipfs/QmAgentCID/metadata/agent%201.json",
    );
  });

  it("validates every redirect target and does not expose its URL", async () => {
    dnsLookup
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }] as never)
      .mockResolvedValueOnce([{ address: "10.2.3.4", family: 4 }] as never);
    replyHttps("", 302, { location: "http://internal.example/admin?token=redirect-secret" });

    const result = await new RegistrationLoader(1_000).load("https://public.example/agent");

    expect(result).toEqual({
      warning: "Registration metadata URI targets a restricted network address",
    });
    expect(result.warning).not.toContain("redirect-secret");
    expect(httpsRequestMock).toHaveBeenCalledTimes(1);
  });

  it("bounds redirect chains", async () => {
    allowPublicDns();
    httpsRequestMock.mockImplementation(((
      input: URL,
      _options: RequestOptions,
      callback: (response: IncomingMessage) => void,
    ) => {
      const step = Number(input.searchParams.get("step") ?? "0");
      callback(
        incomingResponse("", 302, {
          location: `https://metadata.example/agent?step=${step + 1}`,
        }),
      );
      return clientRequest();
    }) as typeof httpsRequest);

    await expect(
      new RegistrationLoader(1_000).load("https://metadata.example/agent?step=0"),
    ).resolves.toEqual({ warning: "Registration metadata redirect limit exceeded" });
    expect(httpsRequestMock).toHaveBeenCalledTimes(4);
  });

  it("rejects a declared response larger than 1 MiB without reading it", async () => {
    allowPublicDns();
    replyHttps("ignored", 200, { "content-length": String(1024 * 1024 + 1) });

    await expect(
      new RegistrationLoader(1_000).load("https://metadata.example/large"),
    ).resolves.toEqual({ warning: "Registration metadata response exceeds the 1 MiB limit" });
  });

  it("stops reading an undeclared response once it exceeds 1 MiB", async () => {
    allowPublicDns();
    replyHttps("x".repeat(1024 * 1024 + 1));

    await expect(
      new RegistrationLoader(1_000).load("https://metadata.example/streamed"),
    ).resolves.toEqual({ warning: "Registration metadata response exceeds the 1 MiB limit" });
  });

  it("returns a sanitized warning for malformed remote JSON", async () => {
    allowPublicDns();
    replyHttps("{not-json");

    await expect(
      new RegistrationLoader(1_000).load("https://metadata.example/agent?token=query-secret"),
    ).resolves.toEqual({ warning: "Registration metadata contains malformed JSON" });
  });

  it("returns a sanitized HTTP status warning", async () => {
    allowPublicDns();
    replyHttps("provider secret", 503);

    await expect(
      new RegistrationLoader(1_000).load("https://metadata.example/agent?token=query-secret"),
    ).resolves.toEqual({ warning: "Registration metadata request returned HTTP 503" });
  });

  it("aborts at the configured deadline without exposing the network error", async () => {
    allowPublicDns();
    httpsRequestMock.mockImplementation(((
      _url: URL,
      _options: RequestOptions,
      _callback: (response: IncomingMessage) => void,
    ) => clientRequest()) as typeof httpsRequest);

    await expect(
      new RegistrationLoader(5).load("https://metadata.example/agent?token=query-secret"),
    ).resolves.toEqual({ warning: "Registration metadata request timed out" });
  });

  it("destroys an active response stream at the deadline", async () => {
    allowPublicDns();
    const response = new Readable({ read() {} }) as IncomingMessage;
    response.statusCode = 200;
    response.headers = {};
    httpsRequestMock.mockImplementation(((
      _url: URL,
      _options: RequestOptions,
      callback: (value: IncomingMessage) => void,
    ) => {
      callback(response);
      return clientRequest();
    }) as typeof httpsRequest);

    await expect(
      new RegistrationLoader(5).load("https://metadata.example/never-ending"),
    ).resolves.toEqual({ warning: "Registration metadata request timed out" });
    expect(response.destroyed).toBe(true);
  });

  it("does not start transport after a pending DNS lookup exceeds the deadline", async () => {
    let releaseDns: ((addresses: Array<{ address: string; family: number }>) => void) | undefined;
    dnsLookup.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseDns = resolve as typeof releaseDns;
        }) as never,
    );

    await expect(
      new RegistrationLoader(5).load("https://metadata.example/slow-dns"),
    ).resolves.toEqual({ warning: "Registration metadata request timed out" });
    releaseDns?.([{ address: "93.184.216.34", family: 4 }]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(httpsRequestMock).not.toHaveBeenCalled();
  });

  it("does not expose raw DNS or transport failures", async () => {
    dnsLookup.mockRejectedValue(
      new Error("getaddrinfo ENOTFOUND metadata.example?token=query-secret"),
    );

    await expect(
      new RegistrationLoader(1_000).load("https://metadata.example/agent?token=query-secret"),
    ).resolves.toEqual({ warning: "Registration metadata request failed" });
  });
});
