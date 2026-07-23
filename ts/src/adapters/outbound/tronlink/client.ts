import { randomUUID } from "node:crypto";
import WebSocket, { type ClientOptions, type RawData } from "ws";
import { isLosslessNumber, parse as parseLosslessJson } from "lossless-json";
import type {
  TronLinkCollaborationPort,
  TronLinkCreateRequest,
  TronLinkListFilter,
  TronLinkRemotePage,
  TronLinkRemoteRecord,
} from "../../../application/ports/tronlink-collaboration.js";
import type {
  Config,
  NetworkDescriptor,
  TronTransactionArtifact,
} from "../../../domain/types/index.js";
import { CliError, ChainError, TransportError, UsageError } from "../../../domain/errors/index.js";
import {
  encodeTronLinkQuery,
  signTronLinkRequest,
  tronLinkAuthParameters,
  type TronLinkCredentials,
} from "./auth.js";

const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_REQUEST_BYTES = 1024 * 1024;
const SOCKET_PATH = "/multi/socket";

type Fetch = typeof globalThis.fetch;
type SocketOptions = ClientOptions;

interface SocketLike {
  readonly readyState: number;
  once(event: "open", listener: () => void): this;
  once(event: "error", listener: (error: Error) => void): this;
  once(event: "close", listener: (code: number) => void): this;
  on(event: "message", listener: (data: RawData) => void): this;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  terminate(): void;
}

type SocketFactory = (url: URL, options: SocketOptions) => SocketLike;

/** Bounded Java-compatible adapter for walletadapter.org's multi-sign REST/WebSocket protocol. */
export class TronLinkClient implements TronLinkCollaborationPort {
  constructor(
    private readonly config: Config,
    private readonly timeoutMs: number,
    private readonly fetchImpl: Fetch = globalThis.fetch,
    private readonly clock: () => number = () => Date.now(),
    private readonly uuid: () => string = randomUUID,
    private readonly socketFactory: SocketFactory = (url, options) => new WebSocket(url, options),
  ) {}

  async list(
    network: NetworkDescriptor,
    address: string,
    filter: TronLinkListFilter,
  ): Promise<TronLinkRemotePage> {
    const credentials = this.#credentials();
    const path = "/multi/list";
    const auth = tronLinkAuthParameters(credentials, this.clock, this.uuid);
    // Java signs only auth + address for GET; filter and pagination fields are unsigned by protocol.
    const signed = { ...auth, address };
    const sign = signTronLinkRequest("GET", path, signed, credentials.secretKey).signature;
    const parameters: Record<string, string> = {
      address,
      start: String(filter.start),
      limit: String(filter.limit),
      state: String(filter.state),
      ...(filter.isSigned === undefined ? {} : { is_sign: String(filter.isSigned) }),
      ...auth,
      sign,
    };
    return parsePage(await this.#request(network, path, parameters), filter.limit);
  }

  async create(
    network: NetworkDescriptor,
    address: string,
    request: TronLinkCreateRequest,
  ): Promise<void> {
    const credentials = this.#credentials();
    const path = "/multi/transaction";
    const auth = tronLinkAuthParameters(credentials, this.clock, this.uuid);
    const signed = {
      ...auth,
      address,
      permission_name: request.permissionName,
      tx_id: request.txId,
    };
    const sign = signTronLinkRequest("POST", path, signed, credentials.secretKey).signature;
    await this.#request(network, path, { ...signed, sign }, {
      raw_data: request.rawDataJson,
      extra: { type: request.contractType },
    });
  }

  async submit(
    network: NetworkDescriptor,
    address: string,
    transaction: TronTransactionArtifact,
  ): Promise<void> {
    const credentials = this.#credentials();
    const path = "/multi/transaction";
    const auth = tronLinkAuthParameters(credentials, this.clock, this.uuid);
    const signed = { ...auth, address };
    const sign = signTronLinkRequest("POST", path, signed, credentials.secretKey).signature;
    await this.#request(network, path, { ...signed, sign }, { address, transaction });
  }

  async watch(
    network: NetworkDescriptor,
    address: string,
    signal: AbortSignal,
    onMessage: (payload: unknown) => void,
  ): Promise<void> {
    const credentials = this.#credentials();
    const endpoint = tronLinkEndpoint(network);
    const auth = tronLinkAuthParameters(credentials, this.clock, this.uuid);
    const signed = { ...auth, address };
    const sign = signTronLinkRequest("GET", SOCKET_PATH, signed, credentials.secretKey).signature;
    const socketUrl = new URL(`${endpoint}${SOCKET_PATH}`);
    socketUrl.protocol = "wss:";
    socketUrl.search = encodeTronLinkQuery({ ...signed, sign });

    await new Promise<void>((resolve, reject) => {
      let opened = false;
      let finished = false;
      const socket = this.socketFactory(socketUrl, {
        handshakeTimeout: this.timeoutMs,
        maxPayload: MAX_RESPONSE_BYTES,
        perMessageDeflate: false,
        followRedirects: false,
      });

      const finish = (error?: CliError) => {
        if (finished) return;
        finished = true;
        signal.removeEventListener("abort", abort);
        if (error) reject(error);
        else resolve();
      };
      const abort = () => {
        if (socket.readyState === WebSocket.OPEN) socket.close(1000, "client shutdown");
        else socket.terminate();
        finish();
      };

      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) return abort();

      socket.once("open", () => {
        opened = true;
        socket.send(JSON.stringify({ address, version: "v1" }));
      });
      socket.on("message", (data: RawData) => {
        const bytes = rawDataBytes(data);
        if (bytes.byteLength > MAX_RESPONSE_BYTES) {
          socket.close(1009, "message too large");
          return finish(new ChainError("provider_error", "TronLink WebSocket message exceeds 1 MiB"));
        }
        try {
          onMessage(normalizeLossless(parseLosslessJson(bytes.toString("utf8"))));
        } catch {
          // The Java client ignores non-JSON frames. Keep the connection alive.
        }
      });
      socket.once("error", () => {
        finish(new TransportError("provider_error", "TronLink WebSocket connection failed"));
      });
      socket.once("close", (code) => {
        if (signal.aborted || code === 1000) return finish();
        finish(new TransportError(
          "provider_error",
          opened
            ? `TronLink WebSocket closed unexpectedly (code ${code})`
            : "TronLink WebSocket handshake failed",
        ));
      });
    });
  }

  #credentials(): TronLinkCredentials {
    const { tronlinkSecretId, tronlinkSecretKey, tronlinkChannel } = this.config;
    if (!tronlinkSecretId || !tronlinkSecretKey || !tronlinkChannel) {
      throw new UsageError(
        "tronlink_credentials_missing",
        "TronLink credentials are incomplete; configure tronlinkSecretId, tronlinkSecretKey, and tronlinkChannel",
      );
    }
    return {
      secretId: tronlinkSecretId,
      secretKey: tronlinkSecretKey,
      channel: tronlinkChannel,
    };
  }

  async #request(
    network: NetworkDescriptor,
    path: string,
    parameters: Readonly<Record<string, string>>,
    body?: unknown,
  ): Promise<unknown> {
    const endpoint = tronLinkEndpoint(network);
    const url = `${endpoint}${path}?${encodeTronLinkQuery(parameters)}`;
    const encodedBody = body === undefined ? undefined : JSON.stringify(body);
    if (encodedBody !== undefined && Buffer.byteLength(encodedBody, "utf8") > MAX_REQUEST_BYTES) {
      throw new UsageError("invalid_value", "TronLink request body exceeds the 1 MiB limit");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: body === undefined ? "GET" : "POST",
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: encodedBody,
        signal: controller.signal,
        redirect: "error",
        referrerPolicy: "no-referrer",
        cache: "no-store",
      });
      if (!response.ok) throw httpError(response);
      const contentLength = response.headers.get("content-length");
      if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_RESPONSE_BYTES) {
        throw new ChainError("provider_error", "TronLink response exceeds the 1 MiB limit");
      }
      const text = await readBoundedText(response, MAX_RESPONSE_BYTES);
      let root: unknown;
      try {
        root = normalizeLossless(parseLosslessJson(text));
      } catch {
        throw new ChainError("provider_error", "TronLink collaboration service returned malformed JSON");
      }
      return unwrapBusinessResponse(root);
    } catch (error) {
      if (error instanceof CliError) throw error;
      if (controller.signal.aborted) {
        throw new ChainError("timeout", `TronLink request timed out after ${this.timeoutMs}ms`);
      }
      throw new TransportError("provider_error", "TronLink collaboration service request failed");
    } finally {
      clearTimeout(timeout);
    }
  }
}

function httpError(response: Response): CliError {
  if (response.status === 404) {
    return new ChainError("not_found", "TronLink collaboration resource was not found");
  }
  if (response.status === 429) {
    return new ChainError("provider_error", "TronLink collaboration service rate limit exceeded", {
      status: 429,
    });
  }
  return new TransportError("provider_error", `TronLink collaboration service returned HTTP ${response.status}`, {
    status: response.status,
  });
}

function tronLinkEndpoint(network: NetworkDescriptor): string {
  if (!network.tronlinkHttpEndpoint) {
    throw new UsageError("unsupported_network", `network ${network.id} has no TronLink collaboration endpoint`);
  }
  let parsed: URL;
  try {
    parsed = new URL(network.tronlinkHttpEndpoint);
  } catch {
    throw new UsageError("invalid_config", `network ${network.id} has an invalid TronLink endpoint`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new UsageError("invalid_config", "TronLink endpoint must be HTTPS without credentials, query, or fragment");
  }
  return parsed.toString().replace(/\/+$/, "");
}

async function readBoundedText(response: Response, maximum: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new ChainError("provider_error", "TronLink response exceeds the 1 MiB limit");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function unwrapBusinessResponse(value: unknown): unknown {
  const root = record(value, "response");
  const code = safeInteger(root.code, "code", 0);
  if (code !== 0) {
    throw new ChainError("provider_error", "TronLink collaboration service rejected the request", { code });
  }
  return root.data;
}

function parsePage(value: unknown, requestedLimit: number): TronLinkRemotePage {
  const data = record(value, "data");
  const total = safeInteger(data.range_total, "data.range_total", 0);
  if (!Array.isArray(data.data) || data.data.length > requestedLimit) {
    throw new ChainError("provider_error", "TronLink response contains an invalid transaction page");
  }
  const records = data.data.map((value, index) => {
    const item = record(value, `data.data[${index}]`);
    return {
      hash: item.hash,
      contract_type: item.contract_type,
      state: item.state,
      is_sign: item.is_sign,
      current_weight: item.current_weight,
      threshold: item.threshold,
      contract_data: item.contract_data,
      originator_address: item.originator_address,
      current_transaction: item.current_transaction,
      signature_progress: item.signature_progress,
    } satisfies TronLinkRemoteRecord;
  });
  return { total, records };
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ChainError("provider_error", `TronLink ${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function safeInteger(value: unknown, field: string, minimum: number): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= minimum) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed >= minimum) return parsed;
  }
  throw new ChainError("provider_error", `TronLink ${field} must be a safe integer`);
}

function normalizeLossless(value: unknown): unknown {
  if (isLosslessNumber(value)) {
    const exact = value.toString();
    const numeric = Number(exact);
    return Number.isSafeInteger(numeric) ? numeric : exact;
  }
  if (Array.isArray(value)) return value.map(normalizeLossless);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeLossless(item)]));
  }
  return value;
}

function rawDataBytes(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (Array.isArray(data)) return Buffer.concat(data);
  throw new ChainError("provider_error", "TronLink WebSocket returned an unsupported frame type");
}
