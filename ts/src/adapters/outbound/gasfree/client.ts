import { createHmac } from "node:crypto";
import {
  isLosslessNumber,
  LosslessNumber,
  parse as parseLosslessJson,
  stringify as stringifyLosslessJson,
} from "lossless-json";
import type { GasFreeProvider } from "../../../application/ports/gasfree-provider.js";
import type {
  Config,
  GasFreeAddressInfo,
  GasFreeProviderConfig,
  GasFreeState,
  GasFreeTokenConfig,
  GasFreeTransferRecord,
  NetworkDescriptor,
  SignedGasFreeAuthorization,
} from "../../../domain/types/index.js";
import {
  ChainError,
  CliError,
  TransportError,
  UsageError,
} from "../../../domain/errors/index.js";
import { TronAddress } from "../../../domain/address/index.js";

const MAX_BYTES = 1024 * 1024;
const ADDRESS = new TronAddress();
const STATES = new Set<GasFreeState>([
  "WAITING",
  "INPROGRESS",
  "CONFIRMING",
  "SUCCEED",
  "FAILED",
]);
type Fetch = typeof globalThis.fetch;

/** Java-compatible adapter for open.gasfree.io. Mutating POST requests are never retried. */
export class GasFreeClient implements GasFreeProvider {
  constructor(
    private readonly config: Config,
    private readonly timeoutMs: number,
    private readonly fetchImpl: Fetch = globalThis.fetch,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  async listTokens(network: NetworkDescriptor): Promise<GasFreeTokenConfig[]> {
    const data = object(
      await this.#request(network, "GET", "/api/v1/config/token/all"),
      "data",
    );
    return array(data.tokens, "data.tokens").map((entry, index) => {
      const item = object(entry, `data.tokens[${index}]`);
      const symbol = optionalText(item.symbol, 32, `data.tokens[${index}].symbol`);
      return {
        tokenAddress: address(item.tokenAddress, `data.tokens[${index}].tokenAddress`),
        activateFee: uint(item.activateFee, `data.tokens[${index}].activateFee`),
        transferFee: uint(item.transferFee, `data.tokens[${index}].transferFee`),
        ...(symbol === undefined ? {} : { symbol }),
        ...(item.decimals === undefined
          ? {}
          : { decimals: smallUInt(item.decimals, `data.tokens[${index}].decimals`, 255) }),
      };
    });
  }

  async listProviders(network: NetworkDescriptor): Promise<GasFreeProviderConfig[]> {
    const data = object(
      await this.#request(network, "GET", "/api/v1/config/provider/all"),
      "data",
    );
    return array(data.providers, "data.providers").map((entry, index) => {
      const item = object(entry, `data.providers[${index}]`);
      const providerConfig = object(item.config, `data.providers[${index}].config`);
      return {
        address: address(item.address, `data.providers[${index}].address`),
        defaultDeadlineDuration: uint(
          providerConfig.defaultDeadlineDuration,
          `data.providers[${index}].config.defaultDeadlineDuration`,
        ),
        ...(typeof item.default === "boolean" ? { isDefault: item.default } : {}),
      };
    });
  }

  async getAddress(
    network: NetworkDescriptor,
    ownerAddress: string,
  ): Promise<GasFreeAddressInfo> {
    if (!ADDRESS.validate(ownerAddress)) {
      throw new UsageError("invalid_value", "ownerAddress must be a valid TRON address");
    }
    const data = object(
      await this.#request(
        network,
        "GET",
        `/api/v1/address/${encodeURIComponent(ownerAddress)}`,
      ),
      "data",
    );
    return {
      ownerAddress,
      gasFreeAddress: address(data.gasFreeAddress, "data.gasFreeAddress"),
      active: boolean(data.active, "data.active"),
      nonce: uint(data.nonce, "data.nonce"),
      ...(typeof data.allowSubmit === "boolean" ? { allowSubmit: data.allowSubmit } : {}),
      assets: array(data.assets, "data.assets").map((entry, index) => {
        const item = object(entry, `data.assets[${index}]`);
        return {
          tokenAddress: address(item.tokenAddress, `data.assets[${index}].tokenAddress`),
          activateFee: uint(item.activateFee, `data.assets[${index}].activateFee`),
          transferFee: uint(item.transferFee, `data.assets[${index}].transferFee`),
        };
      }),
    };
  }

  async submitTransfer(
    network: NetworkDescriptor,
    authorization: SignedGasFreeAuthorization,
  ): Promise<GasFreeTransferRecord> {
    const body = {
      token: authorization.token,
      serviceProvider: authorization.serviceProvider,
      user: authorization.user,
      receiver: authorization.receiver,
      value: new LosslessNumber(authorization.value),
      maxFee: new LosslessNumber(authorization.maxFee),
      deadline: new LosslessNumber(authorization.deadline),
      version: new LosslessNumber(authorization.version),
      nonce: new LosslessNumber(authorization.nonce),
      sig: authorization.sig,
    };
    return transferRecord(
      await this.#request(network, "POST", "/api/v1/gasfree/submit", body),
    );
  }

  async trace(
    network: NetworkDescriptor,
    traceId: string,
  ): Promise<GasFreeTransferRecord> {
    const normalized = traceIdentifier(traceId);
    return transferRecord(
      await this.#request(
        network,
        "GET",
        `/api/v1/gasfree/${encodeURIComponent(normalized)}`,
      ),
    );
  }

  async #request(
    network: NetworkDescriptor,
    method: "GET" | "POST",
    suffix: string,
    body?: unknown,
  ): Promise<unknown> {
    const metadata = endpoint(network);
    const credentials = this.#credentials();
    const path = `${metadata.apiPrefix}${suffix}`;
    const timestamp = String(Math.floor(this.clock() / 1000));
    const signature = createHmac("sha256", credentials.apiSecret)
      .update(`${method}${path}${timestamp}`, "utf8")
      .digest("base64");
    const encoded = body === undefined ? undefined : stringifyLosslessJson(body);
    if (encoded !== undefined && Buffer.byteLength(encoded, "utf8") > MAX_BYTES) {
      throw new UsageError("invalid_value", "GasFree request exceeds the 1 MiB limit");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${metadata.baseUrl}${path}`, {
        method,
        headers: {
          Timestamp: timestamp,
          Authorization: `ApiKey ${credentials.apiKey}:${signature}`,
          Accept: "application/json",
          ...(encoded === undefined ? {} : { "content-type": "application/json" }),
        },
        body: encoded,
        signal: controller.signal,
        redirect: "error",
        referrerPolicy: "no-referrer",
        cache: "no-store",
      });
      if (!response.ok) throw httpError(response);
      const contentLength = response.headers.get("content-length");
      if (
        contentLength
        && /^\d+$/.test(contentLength)
        && Number(contentLength) > MAX_BYTES
      ) {
        throw new ChainError(
          "provider_error",
          "GasFree response exceeds the 1 MiB limit",
        );
      }
      const text = await readBoundedText(response, MAX_BYTES);
      let decoded: unknown;
      try {
        decoded = normalizeLossless(parseLosslessJson(text));
      } catch {
        throw new ChainError(
          "provider_error",
          "GasFree service returned malformed JSON",
        );
      }
      return unwrap(decoded);
    } catch (error) {
      if (error instanceof CliError) throw error;
      if (controller.signal.aborted) {
        throw new ChainError(
          "timeout",
          `GasFree request timed out after ${this.timeoutMs}ms`,
        );
      }
      throw new TransportError(
        "provider_error",
        "GasFree service request failed",
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  #credentials(): { apiKey: string; apiSecret: string } {
    const { gasfreeApiKey: apiKey, gasfreeApiSecret: apiSecret } = this.config;
    if (!apiKey || !apiSecret) {
      throw new UsageError(
        "gasfree_credentials_missing",
        "GasFree credentials are incomplete; configure gasfreeApiKey and gasfreeApiSecret",
      );
    }
    return { apiKey, apiSecret };
  }
}

function endpoint(
  network: NetworkDescriptor,
): { baseUrl: string; apiPrefix: string } {
  const value = network.gasfree;
  if (!value) {
    throw new UsageError(
      "unsupported_network",
      `network ${network.id} does not support GasFree`,
    );
  }
  let url: URL;
  try {
    url = new URL(value.baseUrl);
  } catch {
    throw new UsageError("invalid_config", "GasFree baseUrl is invalid");
  }
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.search
    || url.hash
    || url.pathname !== "/"
  ) {
    throw new UsageError(
      "invalid_config",
      "GasFree baseUrl must be an HTTPS origin without credentials, path, query, or fragment",
    );
  }
  if (!/^\/[a-z0-9-]+$/.test(value.apiPrefix)) {
    throw new UsageError(
      "invalid_config",
      "GasFree apiPrefix must be one absolute path segment",
    );
  }
  return { baseUrl: url.origin, apiPrefix: value.apiPrefix };
}

function httpError(response: Response): CliError {
  if (response.status === 401 || response.status === 403) {
    return new ChainError(
      "gasfree_auth_failed",
      "GasFree credentials were rejected",
      { status: response.status },
    );
  }
  if (response.status === 404) {
    return new ChainError("not_found", "GasFree resource was not found", {
      status: 404,
    });
  }
  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    return new ChainError(
      "provider_rate_limited",
      "GasFree service rate limit exceeded",
      {
        status: 429,
        ...(retryAfter && /^[\x20-\x7e]{1,128}$/.test(retryAfter)
          ? { retryAfter }
          : {}),
      },
    );
  }
  if (response.status >= 500) {
    return new TransportError(
      "provider_error",
      `GasFree service returned HTTP ${response.status}`,
    );
  }
  return new ChainError(
    "gasfree_rejected",
    `GasFree service returned HTTP ${response.status}`,
    { status: response.status },
  );
}

function unwrap(value: unknown): unknown {
  const root = object(value, "response");
  const code = smallUInt(root.code, "code", 999_999);
  if (code !== 200) {
    throw new ChainError(
      "gasfree_rejected",
      "GasFree service rejected the request",
      { code },
    );
  }
  if (root.data === null || root.data === undefined) {
    throw new ChainError("not_found", "GasFree resource was not found");
  }
  return root.data;
}

function transferRecord(value: unknown): GasFreeTransferRecord {
  const data = object(value, "data");
  const state = text(data.state, "data.state", 32) as GasFreeState;
  if (!STATES.has(state)) throw invalid("data.state", "a known GasFree state");
  return {
    id: traceIdentifier(text(data.id, "data.id", 128)),
    state,
    tokenAddress: address(data.tokenAddress, "data.tokenAddress"),
    providerAddress: address(data.providerAddress, "data.providerAddress"),
    accountAddress: address(data.accountAddress, "data.accountAddress"),
    gasFreeAddress: address(data.gasFreeAddress, "data.gasFreeAddress"),
    targetAddress: address(data.targetAddress, "data.targetAddress"),
    amount: uint(data.amount, "data.amount"),
    nonce: uint(data.nonce, "data.nonce"),
    ...optionalUintFields(data, [
      "maxFee",
      "expiredAt",
      "estimatedTransferFee",
      "estimatedActivateFee",
      "estimatedTotalFee",
      "estimatedTotalCost",
      "txnAmount",
      "txnTransferFee",
      "txnActivateFee",
      "txnTotalFee",
      "txnTotalCost",
      "txnBlockNum",
      "txnBlockTimestamp",
    ]),
    ...(data.txnHash === undefined || data.txnHash === null
      ? {}
      : { txnHash: transactionHash(data.txnHash) }),
    ...(data.txnState === undefined || data.txnState === null
      ? {}
      : { txnState: text(data.txnState, "data.txnState", 64) }),
    ...(data.failureReason === undefined || data.failureReason === null
      ? {}
      : {
          failureReason: text(
            data.failureReason,
            "data.failureReason",
            256,
          ),
        }),
  };
}

function optionalUintFields(
  data: Record<string, unknown>,
  fields: readonly string[],
): Record<string, string> {
  return Object.fromEntries(
    fields
      .filter((field) => data[field] !== undefined && data[field] !== null)
      .map((field) => [field, uint(data[field], `data.${field}`)]),
  );
}

function transactionHash(value: unknown): string {
  const result = text(value, "data.txnHash", 66)
    .replace(/^0x/, "")
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(result)) {
    throw invalid("data.txnHash", "a 32-byte transaction hash");
  }
  return result;
}

function traceIdentifier(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(normalized)) {
    throw new UsageError(
      "invalid_value",
      "traceId contains unsupported characters",
    );
  }
  return normalized;
}

function address(value: unknown, field: string): string {
  const result = text(value, field, 64);
  if (!ADDRESS.validate(result)) throw invalid(field, "a valid TRON address");
  return result;
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw invalid(field, "a boolean");
  return value;
}

function uint(value: unknown, field: string): string {
  let result: string;
  if (
    typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
  ) {
    result = String(value);
  } else if (
    typeof value === "string"
    && /^(0|[1-9]\d*)$/.test(value)
  ) {
    result = value;
  } else {
    throw invalid(field, "an unsigned decimal integer");
  }
  // All values entering GasFree authorization/hash math are uint256. Bound length before BigInt
  // conversion so an authenticated-but-malicious response cannot trigger huge integer parsing.
  if (result.length > 78 || BigInt(result) >= 1n << 256n) {
    throw invalid(field, "an unsigned uint256 decimal integer");
  }
  return result;
}

function smallUInt(value: unknown, field: string, maximum: number): number {
  const parsed = Number(uint(value, field));
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw invalid(field, `an integer no greater than ${maximum}`);
  }
  return parsed;
}

function text(value: unknown, field: string, maximum: number): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maximum
    || /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw invalid(
      field,
      `non-empty text no longer than ${maximum} characters`,
    );
  }
  return value;
}

function optionalText(
  value: unknown,
  maximum: number,
  field: string,
): string | undefined {
  return value === undefined || value === null
    ? undefined
    : text(value, field, maximum);
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid(field, "an object");
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value) || value.length > 1000) {
    throw invalid(field, "an array with at most 1000 entries");
  }
  return value;
}

function invalid(field: string, expected: string): ChainError {
  return new ChainError(
    "provider_error",
    `GasFree ${field} must be ${expected}`,
  );
}

async function readBoundedText(
  response: Response,
  maximum: number,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let output = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        throw new ChainError(
          "provider_error",
          "GasFree response exceeds the 1 MiB limit",
        );
      }
      output += decoder.decode(value, { stream: true });
    }
    return output + decoder.decode();
  } finally {
    reader.releaseLock();
  }
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
      Object.entries(value).map(([key, item]) => [
        key,
        normalizeLossless(item),
      ]),
    );
  }
  return value;
}
