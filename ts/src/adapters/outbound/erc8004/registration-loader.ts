import { createGunzip } from "node:zlib";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_JSON_DEPTH = 20;

export interface RegistrationLoadResult {
  metadata?: Record<string, unknown>;
  warning?: string;
}

type FailureKind =
  | "invalid_content_type"
  | "invalid_encoding"
  | "invalid_uri"
  | "restricted_address"
  | "redirect_disallowed"
  | "too_deep"
  | "too_large"
  | "malformed_json"
  | "not_object"
  | "timeout"
  | "http_status"
  | "request_failed";

class LoaderFailure extends Error {
  constructor(
    readonly kind: FailureKind,
    readonly status?: number,
  ) {
    super(kind);
    this.name = "LoaderFailure";
  }
}

const restrictedAddresses = new BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  restrictedAddresses.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  restrictedAddresses.addSubnet(network, prefix, "ipv6");
}

/** Loads untrusted ERC-8004 registration metadata without exposing transport details. */
export class RegistrationLoader {
  readonly #timeoutMs: number;

  constructor(timeoutMs: number) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new RangeError("Registration metadata timeout must be positive");
    }
    this.#timeoutMs = Math.min(timeoutMs, 10_000);
  }

  async load(uri: string): Promise<RegistrationLoadResult> {
    try {
      return await this.#loadRemote(uri);
    } catch (error) {
      return { warning: warningFor(error) };
    }
  }

  async #loadRemote(initialTarget: string): Promise<RegistrationLoadResult> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new LoaderFailure("timeout"));
      }, this.#timeoutMs);
    });

    try {
      return await Promise.race([fetchMetadata(initialTarget, controller.signal), deadline]);
    } catch (error) {
      if (controller.signal.aborted) throw new LoaderFailure("timeout");
      throw error;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      controller.abort();
    }
  }
}

async function fetchMetadata(
  initialTarget: string,
  signal: AbortSignal,
): Promise<RegistrationLoadResult> {
  const validated = await validatedRemoteUrl(initialTarget);
  if (signal.aborted) throw new LoaderFailure("timeout");
  let response: IncomingMessage;
  try {
    response = await requestOnce(validated, signal);
  } catch {
    throw new LoaderFailure("request_failed");
  }
  const destroyOnAbort = () => response.destroy();
  signal.addEventListener("abort", destroyOnAbort, { once: true });
  try {
    const status = response.statusCode ?? 0;
    if (isRedirect(status)) {
      response.destroy();
      throw new LoaderFailure("redirect_disallowed");
    }
    if (status < 200 || status >= 300) {
      response.destroy();
      throw new LoaderFailure("http_status", status);
    }
    const contentType = headerValue(response, "content-type") ?? "";
    if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(contentType)) {
      response.destroy();
      throw new LoaderFailure("invalid_content_type");
    }
    return parseMetadata(await readBoundedText(response));
  } finally {
    signal.removeEventListener("abort", destroyOnAbort);
  }
}

interface ValidatedTarget {
  url: URL;
  addresses: LookupAddress[];
}

function requestOnce(target: ValidatedTarget, signal: AbortSignal): Promise<IncomingMessage> {
  const requestFn = target.url.protocol === "https:" ? httpsRequest : httpRequest;
  const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
    const requestedFamily = Number(options.family ?? 0);
    const candidates = target.addresses.filter(
      (address) => requestedFamily === 0 || requestedFamily === address.family,
    );
    if (candidates.length === 0) {
      const error = Object.assign(new Error("Pinned address family unavailable"), {
        code: "ENOTFOUND",
      });
      callback(error, "");
      return;
    }
    if (options.all) callback(null, candidates);
    else callback(null, candidates[0]!.address, candidates[0]!.family);
  };

  return new Promise((resolve, reject) => {
    const request = requestFn(
      target.url,
      {
        method: "GET",
        headers: { accept: "application/json", "accept-encoding": "gzip" },
        lookup: pinnedLookup,
        signal,
      },
      resolve,
    );
    request.once("error", reject);
    request.end();
  });
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function validatedRemoteUrl(target: string): Promise<ValidatedTarget> {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new LoaderFailure("invalid_uri");
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new LoaderFailure("invalid_uri");
  }

  const hostname = unbracket(url.hostname).toLowerCase().replace(/\.$/, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new LoaderFailure("restricted_address");
  }

  const family = isIP(hostname);
  if (family !== 0) {
    assertPublicAddress(hostname, family);
    return { url, addresses: [{ address: hostname, family }] };
  }

  let addresses: LookupAddress[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new LoaderFailure("request_failed");
  }
  if (addresses.length === 0) throw new LoaderFailure("request_failed");
  for (const address of addresses) assertPublicAddress(address.address, address.family);
  return { url, addresses };
}

function unbracket(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

function assertPublicAddress(address: string, family: number): void {
  if (
    (family === 4 && restrictedAddresses.check(address, "ipv4")) ||
    (family === 6 && restrictedAddresses.check(address, "ipv6")) ||
    (family !== 4 && family !== 6)
  ) {
    throw new LoaderFailure("restricted_address");
  }
}

async function readBoundedText(response: IncomingMessage): Promise<string> {
  const contentLength = headerValue(response, "content-length");
  if (contentLength && /^\d+$/.test(contentLength) && BigInt(contentLength) > MAX_RESPONSE_BYTES) {
    response.destroy();
    throw new LoaderFailure("too_large");
  }

  const encoding = (headerValue(response, "content-encoding") ?? "identity").trim().toLowerCase();
  if (encoding !== "identity" && encoding !== "gzip") {
    response.destroy();
    throw new LoaderFailure("invalid_encoding");
  }
  let compressed = 0;
  let expanded = 0;
  const chunks: Buffer[] = [];
  const boundInput = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      compressed += chunk.length;
      callback(compressed > MAX_RESPONSE_BYTES ? new LoaderFailure("too_large") : null, chunk);
    },
  });
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      expanded += chunk.length;
      if (expanded > MAX_RESPONSE_BYTES) {
        callback(new LoaderFailure("too_large"));
        return;
      }
      chunks.push(chunk);
      callback();
    },
  });
  try {
    if (encoding === "gzip") await pipeline(response, boundInput, createGunzip(), sink);
    else await pipeline(response, boundInput, sink);
  } catch (error) {
    if (error instanceof LoaderFailure) throw error;
    throw new LoaderFailure(encoding === "gzip" ? "invalid_encoding" : "request_failed");
  }
  return decodeUtf8(Buffer.concat(chunks, expanded));
}

function headerValue(response: IncomingMessage, name: string): string | undefined {
  const value = response.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new LoaderFailure("malformed_json");
  }
}

function parseMetadata(text: string): RegistrationLoadResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new LoaderFailure("malformed_json");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new LoaderFailure("not_object");
  }
  const pending: Array<{ value: object; depth: number }> = [{ value, depth: 1 }];
  while (pending.length) {
    const current = pending.pop()!;
    if (current.depth > MAX_JSON_DEPTH) throw new LoaderFailure("too_deep");
    for (const child of Object.values(current.value)) {
      if (child !== null && typeof child === "object") {
        pending.push({ value: child, depth: current.depth + 1 });
      }
    }
  }
  return { metadata: value as Record<string, unknown> };
}

function warningFor(error: unknown): string {
  if (!(error instanceof LoaderFailure)) return "Registration metadata request failed";
  switch (error.kind) {
    case "invalid_content_type":
      return "Registration metadata requires application/json with UTF-8 encoding";
    case "invalid_encoding":
      return "Registration metadata has an invalid or unsupported content encoding";
    case "invalid_uri":
      return "Registration metadata URI is invalid or unsupported";
    case "restricted_address":
      return "Registration metadata URI targets a restricted network address";
    case "redirect_disallowed":
      return "Registration metadata redirects are not allowed";
    case "too_deep":
      return "Registration metadata exceeds the maximum JSON depth of 20";
    case "too_large":
      return "Registration metadata response exceeds the 1 MiB limit";
    case "malformed_json":
      return "Registration metadata contains malformed JSON";
    case "not_object":
      return "Registration metadata is not a JSON object";
    case "timeout":
      return "Registration metadata request timed out";
    case "http_status":
      return `Registration metadata request returned HTTP ${error.status ?? "error"}`;
    case "request_failed":
      return "Registration metadata request failed";
  }
}
