import { isTronNetwork } from "../../../domain/types/network.js";
import { randomUUID } from "node:crypto";
import WebSocket, { type ClientOptions, type RawData } from "ws";
import { isLosslessNumber, parse as parseLosslessJson } from "lossless-json";
import type {
  TronLinkCollaborationPort,
  TronLinkListFilter,
  TronLinkRemoteEntry,
  TronLinkRemotePage,
  TronLinkRemoteRecord,
} from "../../../application/ports/tronlink-collaboration.js";
import type {
  Config,
  NetworkDescriptor,
  TronLinkSignatureProgressView,
  TronProtocolValue,
  TronTransactionArtifact,
} from "../../../domain/types/index.js";
import type { BroadcastGuard } from "../../../application/contracts/broadcast-guard.js";
import { CliError, ChainError, TransportError, UsageError } from "../../../domain/errors/index.js";
import { TronAddress, tronHexToBase58 } from "../../../domain/address/index.js";
import {
  encodeTronLinkQuery,
  signTronLinkRequest,
  tronLinkAuthParameters,
  type TronLinkCredentials,
} from "./auth.js";
import { normalizeTxHash } from "../../../domain/family/index.js";

const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_REQUEST_BYTES = 1024 * 1024;
const SOCKET_PATH = "/multi/socket";
const ADDRESS = new TronAddress();
const STATE_CODES = { all: 255, open: 0, success: 1, failed: 2 } as const;

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

export class TronLinkClient implements TronLinkCollaborationPort {
  constructor(
    private readonly config: Config,
    private readonly timeoutMs: number,
    private readonly guard: BroadcastGuard,
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
    // GET signatures cover auth and address; filters and pagination remain unsigned.
    const signed = { ...auth, address };
    const sign = signTronLinkRequest("GET", path, signed, credentials.secretKey).signature;
    const parameters: Record<string, string> = {
      address,
      start: String(filter.start),
      limit: String(filter.limit),
      state: String(STATE_CODES[filter.state]),
      ...(filter.isSigned === undefined ? {} : { is_sign: String(filter.isSigned) }),
      ...auth,
      sign,
    };
    return parsePage(await this.#request(network, path, parameters), filter.limit);
  }

  async submit(
    network: NetworkDescriptor,
    address: string,
    transaction: TronTransactionArtifact,
  ): Promise<void> {
    this.guard.assertAllowed();
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
    onUnsignedCount: (count: number) => void,
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
          return finish(
            new ChainError("provider_error", "TronLink WebSocket message exceeds 1 MiB"),
          );
        }
        try {
          const count = unsignedOpenCount(
            normalizeLossless(parseLosslessJson(bytes.toString("utf8"))),
          );
          if (count !== undefined) onUnsignedCount(count);
        } catch {
          // Ignore parse or callback errors and keep the connection alive.
        }
      });
      socket.once("error", () => {
        finish(new TransportError("provider_error", "TronLink WebSocket connection failed"));
      });
      socket.once("close", (code) => {
        if (signal.aborted || code === 1000) return finish();
        finish(
          new TransportError(
            "provider_error",
            opened
              ? `TronLink WebSocket closed unexpectedly (code ${code})`
              : "TronLink WebSocket handshake failed",
          ),
        );
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
      if (
        contentLength &&
        /^\d+$/.test(contentLength) &&
        Number(contentLength) > MAX_RESPONSE_BYTES
      ) {
        throw new ChainError("provider_error", "TronLink response exceeds the 1 MiB limit");
      }
      const text = await readBoundedText(response, MAX_RESPONSE_BYTES);
      let root: unknown;
      try {
        root = normalizeLossless(parseLosslessJson(text));
      } catch {
        throw new ChainError(
          "provider_error",
          "TronLink collaboration service returned malformed JSON",
        );
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
  return new TransportError(
    "provider_error",
    `TronLink collaboration service returned HTTP ${response.status}`,
    {
      status: response.status,
    },
  );
}

function tronLinkEndpoint(network: NetworkDescriptor): string {
  const endpoint = isTronNetwork(network) ? network.tronlinkHttpEndpoint : undefined;
  if (!endpoint) {
    throw new UsageError(
      "unsupported_network",
      `network ${network.id} has no TronLink collaboration endpoint`,
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new UsageError(
      "invalid_config",
      `network ${network.id} has an invalid TronLink endpoint`,
    );
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new UsageError(
      "invalid_config",
      "TronLink endpoint must be HTTPS without credentials, query, or fragment",
    );
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
      if (size > maximum)
        throw new ChainError("provider_error", "TronLink response exceeds the 1 MiB limit");
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
    // Include provider wording to distinguish rejection causes.
    const providerMessage = boundedProviderMessage(root.message);
    throw new ChainError("provider_error", "TronLink collaboration service rejected the request", {
      providerCode: code,
      ...(providerMessage === undefined ? {} : { providerMessage }),
    });
  }
  return root.data;
}

// Sanitize provider text before exposing it in error details.
function boundedProviderMessage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replaceAll(/[\p{Cc}\p{Cf}]/gu, "").trim();
  return cleaned === "" ? undefined : cleaned.slice(0, 200);
}

function parsePage(value: unknown, requestedLimit: number): TronLinkRemotePage {
  const data = record(value, "data");
  const total = safeInteger(data.range_total, "data.range_total", 0);
  if (!Array.isArray(data.data) || data.data.length > requestedLimit) {
    throw new ChainError(
      "provider_error",
      "TronLink response contains an invalid transaction page",
    );
  }
  const entries = data.data.map((value, index) =>
    parseTronLinkEntry(record(value, `data.data[${index}]`)),
  );
  return { total, entries };
}

export function parseTronLinkEntry(item: Record<string, unknown>): TronLinkRemoteEntry {
  const claimedTxId = claimedHash(item.hash);
  try {
    return { kind: "record", claimedTxId, record: remoteRecord(item) };
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    return { kind: "malformed", claimedTxId, error };
  }
}

function remoteRecord(item: Record<string, unknown>): TronLinkRemoteRecord {
  const txId = hash(stringValue(item.hash, "hash"));
  const contractType = stringValue(item.contract_type, "contract_type");
  const contractData = record(item.contract_data, "contract_data");
  const ownerAddress = base58Address(contractData.owner_address, "contract_data.owner_address");
  const originatorAddress = base58Address(item.originator_address, "originator_address");
  const stateCode = safeInteger(item.state, "state", 0);
  const signed = booleanFlag(item.is_sign, "is_sign");
  const status = recordStatus(stateCode);
  return {
    txId,
    contractType,
    status,
    signed,
    currentWeight: safeInteger(item.current_weight, "current_weight", 0),
    threshold: safeInteger(item.threshold, "threshold", 1),
    ownerAddress,
    originatorAddress,
    signatureProgress: signatureProgress(item.signature_progress),
    // normalizeLossless has already turned the body into plain JSON values.
    currentTransaction: (item.current_transaction ?? null) as TronProtocolValue,
  };
}

function signatureProgress(value: unknown): TronLinkSignatureProgressView[] {
  if (!Array.isArray(value)) {
    throw new ChainError("provider_error", "TronLink signature_progress must be an array");
  }
  return value.map((entry, index) => {
    const item = record(entry, `signature_progress[${index}]`);
    const address = base58Address(item.address, `signature_progress[${index}].address`);
    const weight = safeInteger(item.weight, `signature_progress[${index}].weight`, 1);
    const signed = booleanFlag(item.is_sign, `signature_progress[${index}].is_sign`);
    // sign_time is in seconds; 0 means not signed.
    const signTime = safeInteger(item.sign_time ?? 0, `signature_progress[${index}].sign_time`, 0);
    const signedAt = signTime === 0 ? null : signTime * 1000;
    if (!Number.isSafeInteger(signedAt ?? 0)) {
      throw new ChainError("provider_error", "TronLink signature timestamp is inconsistent");
    }
    return { address, weight, signed, signedAt };
  });
}

function recordStatus(code: number): TronLinkRemoteRecord["status"] {
  if (code === 0) return "open";
  if (code === 1) return "success";
  if (code === 2) return "failed";
  throw new ChainError("provider_error", `TronLink returned unsupported transaction state ${code}`);
}

// A malformed entry discards the whole message.
export function unsignedOpenCount(payload: unknown): number | undefined {
  if (!Array.isArray(payload)) return undefined;
  return payload.filter((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const item = entry as Record<string, unknown>;
    return (
      booleanFlag(item.is_sign, "is_sign") === false && safeInteger(item.state, "state", 0) === 0
    );
  }).length;
}

function claimedHash(value: unknown): string | null {
  return (typeof value === "string" ? normalizeTxHash("tron", value) : undefined) ?? null;
}

function hash(value: string): string {
  const normalized = normalizeTxHash("tron", value);
  if (normalized === undefined) {
    throw new ChainError("provider_error", "TronLink hash is not a 32-byte hex string");
  }
  return normalized;
}

function base58Address(value: unknown, field: string): string {
  const normalized = tronHexToBase58(stringValue(value, field));
  if (!ADDRESS.validate(normalized)) {
    throw new ChainError("provider_error", `TronLink ${field} is not a valid TRON address`);
  }
  return normalized;
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    throw new ChainError("provider_error", `TronLink ${field} must be a non-empty string`);
  }
  return value;
}

function booleanFlag(value: unknown, field: string): boolean {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  throw new ChainError("provider_error", `TronLink ${field} must be a boolean flag`);
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
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeLossless(item)]),
    );
  }
  return value;
}

function rawDataBytes(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (Array.isArray(data)) return Buffer.concat(data);
  throw new ChainError("provider_error", "TronLink WebSocket returned an unsupported frame type");
}
