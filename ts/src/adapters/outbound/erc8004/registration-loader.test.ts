import {
  CommandDeadline,
  requestDispatchCheck,
} from "../../../application/services/command-deadline.js";
import { lookup } from "node:dns/promises";
import { EventEmitter } from "node:events";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RegistrationLoader } from "./registration-loader.js";
import { expiredCheck, expiringCheck } from "../http/__test-support__/dispatch.js";
import { DeadlineExpiredError } from "../../../application/contracts/deadline.js";

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
  body: string | Buffer,
  statusCode = 200,
  headers: IncomingMessage["headers"] = {},
): IncomingMessage {
  const response = Readable.from([Buffer.from(body)]) as IncomingMessage;
  response.statusCode = statusCode;
  response.headers = { "content-type": "application/json", ...headers };
  return response;
}

function clientRequest(): ClientRequest {
  const request = new EventEmitter() as ClientRequest;
  request.end = vi.fn();
  return request;
}

function replyHttps(
  body: string | Buffer,
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

function replyHttp(body: string | Buffer, statusCode = 200): void {
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

  it("rejects a data URI without resolving or requesting it", async () => {
    const encoded = Buffer.from(JSON.stringify({ name: "Ada", active: true })).toString("base64");

    await expect(
      new RegistrationLoader(1_000).load(`data:application/json;base64,${encoded}`, NO_CHECK),
    ).resolves.toEqual({ warning: "Registration metadata URI is invalid or unsupported" });
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
    const result = await new RegistrationLoader(1_000).load(uri, NO_CHECK);

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
  ])("requires HTTP metadata to be a JSON object: %s", async (_label, value) => {
    allowPublicDns();
    replyHttps(JSON.stringify(value));
    await expect(
      new RegistrationLoader(1_000).load("https://metadata.example/agent.json", NO_CHECK),
    ).resolves.toEqual({ warning: "Registration metadata is not a JSON object" });
  });

  it("loads an HTTP JSON object after resolving the host to a public address", async () => {
    allowPublicDns();
    replyHttps(JSON.stringify({ name: "remote" }), 200, { "content-type": "application/json" });

    await expect(
      new RegistrationLoader(1_000).load("https://metadata.example/agent.json", NO_CHECK),
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
      response.headers = { "content-type": "application/json" };
      callback(response);
      const request = new EventEmitter() as ClientRequest;
      request.end = vi.fn();
      return request;
    }) as typeof httpsRequest);
    fetchMock.mockRejectedValue(new Error("unsafe hostname resolution was used"));

    await expect(
      new RegistrationLoader(1_000).load("https://metadata.example/agent.json", NO_CHECK),
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
      new RegistrationLoader(1_000).load("http://metadata.example/agent.json", NO_CHECK),
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
    await expect(new RegistrationLoader(1_000).load(uri, NO_CHECK)).resolves.toEqual({
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
      new RegistrationLoader(1_000).load("https://mixed.example/agent", NO_CHECK),
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
    const result = await new RegistrationLoader(1_000).load(uri, NO_CHECK);

    expect(result).toEqual({ warning: "Registration metadata URI is invalid or unsupported" });
    expect(result.warning).not.toContain("secret");
    expect(result.warning).not.toContain("query-secret");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(httpRequestMock).not.toHaveBeenCalled();
    expect(httpsRequestMock).not.toHaveBeenCalled();
  });

  it("rejects IPFS without using a gateway or DNS", async () => {
    await expect(
      new RegistrationLoader(1_000).load("ipfs://QmAgentCID/agent.json", NO_CHECK),
    ).resolves.toEqual({ warning: "Registration metadata URI is invalid or unsupported" });
    expect(dnsLookup).not.toHaveBeenCalled();
    expect(httpsRequestMock).not.toHaveBeenCalled();
  });

  it.each([301, 302, 303, 307, 308])(
    "stops HTTP %s before resolving any Location",
    async (status) => {
      allowPublicDns();
      replyHttps("", status, { location: "http://internal.example/admin?token=secret" });
      await expect(
        new RegistrationLoader(1_000).load("https://metadata.example/agent.json", NO_CHECK),
      ).resolves.toEqual({ warning: "Registration metadata redirects are not allowed" });
      expect(dnsLookup).toHaveBeenCalledTimes(1);
      expect(httpsRequestMock).toHaveBeenCalledTimes(1);
      expect(httpRequestMock).not.toHaveBeenCalled();
    },
  );

  it.each([20, 21, 10000])("limits object/array depth at %s", async (depth) => {
    allowPublicDns();
    replyHttps('{"child":'.repeat(depth - 1) + "{}" + "}".repeat(depth - 1));
    const result = await new RegistrationLoader(1000).load(
      "https://metadata.example/agent.json",
      NO_CHECK,
    );
    if (depth <= 20) expect(result.metadata).toBeDefined();
    else
      expect(result).toEqual({
        warning: "Registration metadata exceeds the maximum JSON depth of 20",
      });
  });

  it("keeps the 10 s cap and its warning when the command deadline is longer", async () => {
    vi.useFakeTimers();
    try {
      allowPublicDns();
      httpsRequestMock.mockImplementation(() => clientRequest());
      let settled = false;
      const pending = new RegistrationLoader()
        .load("https://metadata.example/agent.json", expiringCheck(30_000))
        .then((result) => {
          settled = true;
          return result;
        });
      await vi.advanceTimersByTimeAsync(9_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending).toEqual({ warning: "Registration metadata request timed out" });
      expect((httpsRequestMock.mock.calls[0]![1] as RequestOptions).signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails the load when the command deadline expires before the cap", async () => {
    vi.useFakeTimers();
    try {
      allowPublicDns();
      httpsRequestMock.mockImplementation(() => clientRequest());
      const pending = new RegistrationLoader()
        .load("https://metadata.example/agent.json", expiringCheck(5_000))
        .catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(await pending).toBeInstanceOf(DeadlineExpiredError);
      expect((httpsRequestMock.mock.calls[0]![1] as RequestOptions).signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses to start once the command deadline has expired", async () => {
    await expect(
      new RegistrationLoader().load("https://metadata.example/agent.json", expiredCheck()),
    ).rejects.toBeInstanceOf(DeadlineExpiredError);
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it("rejects a declared response larger than 1 MiB without reading it", async () => {
    allowPublicDns();
    replyHttps("ignored", 200, { "content-length": String(1024 * 1024 + 1) });

    await expect(
      new RegistrationLoader(1_000).load("https://metadata.example/large", NO_CHECK),
    ).resolves.toEqual({ warning: "Registration metadata response exceeds the 1 MiB limit" });
  });

  it("stops reading an undeclared response once it exceeds 1 MiB", async () => {
    allowPublicDns();
    replyHttps("x".repeat(1024 * 1024 + 1));

    await expect(
      new RegistrationLoader(1_000).load("https://metadata.example/streamed", NO_CHECK),
    ).resolves.toEqual({ warning: "Registration metadata response exceeds the 1 MiB limit" });
  });

  it("returns a sanitized warning for malformed remote JSON", async () => {
    allowPublicDns();
    replyHttps("{not-json");

    await expect(
      new RegistrationLoader(1_000).load(
        "https://metadata.example/agent?token=query-secret",
        NO_CHECK,
      ),
    ).resolves.toEqual({ warning: "Registration metadata contains malformed JSON" });
  });

  it("returns a sanitized HTTP status warning", async () => {
    allowPublicDns();
    replyHttps("provider secret", 503);

    await expect(
      new RegistrationLoader(1_000).load(
        "https://metadata.example/agent?token=query-secret",
        NO_CHECK,
      ),
    ).resolves.toEqual({ warning: "Registration metadata request returned HTTP 503" });
  });

  it("aborts at the cap without exposing the network error", async () => {
    allowPublicDns();
    httpsRequestMock.mockImplementation(((
      _url: URL,
      _options: RequestOptions,
      _callback: (response: IncomingMessage) => void,
    ) => clientRequest()) as typeof httpsRequest);

    await expect(
      new RegistrationLoader(5).load("https://metadata.example/agent?token=query-secret", NO_CHECK),
    ).resolves.toEqual({ warning: "Registration metadata request timed out" });
  });

  it("destroys an active response stream at the cap", async () => {
    allowPublicDns();
    const response = new Readable({ read() {} }) as IncomingMessage;
    response.statusCode = 200;
    response.headers = { "content-type": "application/json" };
    httpsRequestMock.mockImplementation(((
      _url: URL,
      _options: RequestOptions,
      callback: (value: IncomingMessage) => void,
    ) => {
      callback(response);
      return clientRequest();
    }) as typeof httpsRequest);

    await expect(
      new RegistrationLoader(5).load("https://metadata.example/never-ending", NO_CHECK),
    ).resolves.toEqual({ warning: "Registration metadata request timed out" });
    expect(response.destroyed).toBe(true);
  });

  it("does not start transport after a pending DNS lookup exceeds the cap", async () => {
    let releaseDns: ((addresses: Array<{ address: string; family: number }>) => void) | undefined;
    dnsLookup.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseDns = resolve as typeof releaseDns;
        }) as never,
    );

    await expect(
      new RegistrationLoader(5).load("https://metadata.example/slow-dns", NO_CHECK),
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
      new RegistrationLoader(1_000).load(
        "https://metadata.example/agent?token=query-secret",
        NO_CHECK,
      ),
    ).resolves.toEqual({ warning: "Registration metadata request failed" });
  });
});

import { gzipSync } from "node:zlib";

const NO_CHECK = requestDispatchCheck(new CommandDeadline(0));
it.each(["text/plain", "application/json; charset=utf-16le", ""])(
  "rejects metadata content type %s",
  async (contentType) => {
    allowPublicDns();
    replyHttps('{"name":"ignored"}', 200, { "content-type": contentType });
    await expect(
      new RegistrationLoader(1000).load("https://example.test/a", NO_CHECK),
    ).resolves.toEqual({
      warning: "Registration metadata requires application/json with UTF-8 encoding",
    });
  },
);
it.each([1024 * 1024, 1024 * 1024 + 1])("bounds decompressed gzip at %s bytes", async (size) => {
  allowPublicDns();
  const body = JSON.stringify({ name: "a".repeat(size - 11) });
  expect(Buffer.byteLength(body)).toBe(size);
  replyHttps(gzipSync(body), 200, { "content-encoding": "gzip" });
  const result = await new RegistrationLoader(1000).load("https://example.test/a", NO_CHECK);
  if (size === 1024 * 1024)
    expect((result.metadata as { name?: string } | undefined)?.name).toHaveLength(size - 11);
  else expect(result.warning).toContain("1 MiB");
});
it("rejects corrupt gzip without returning metadata", async () => {
  allowPublicDns();
  replyHttps("not gzip", 200, { "content-encoding": "gzip" });
  await expect(
    new RegistrationLoader(1000).load("https://example.test/a", NO_CHECK),
  ).resolves.toMatchObject({
    warning: expect.stringContaining("content encoding"),
  });
});
