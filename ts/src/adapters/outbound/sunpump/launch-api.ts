// Unknown outcomes must not be retried: the service may have already created the token.
import type { NetworkDescriptor } from "../../../domain/types/network.js";
import type {
  SunPumpTokenLaunchPort,
  SunPumpTokenLaunchRequest,
} from "../../../application/ports/sunpump/token-launch.js";
import type { SunPumpTokenRecord } from "../../../application/ports/sunpump/market-data.js";
import { ChainError, CliError, UsageError } from "../../../domain/errors/index.js";
import { isTokenRow, mapToken } from "./market-api.mapper.js";
import { rawTokenSchema, type RawToken } from "./market-api.schema.js";
import { parseSunPumpShape, sunpumpRequest, type SunPumpApiDeps } from "./api-transport.js";

export class SunPumpLaunchApi implements SunPumpTokenLaunchPort {
  constructor(
    private readonly timeoutMs: number,
    private readonly deps: SunPumpApiDeps = {},
  ) {}

  async launchToken(
    network: NetworkDescriptor,
    request: SunPumpTokenLaunchRequest,
  ): Promise<SunPumpTokenRecord> {
    try {
      const payload = await sunpumpRequest(network, this.timeoutMs, this.deps, (client) =>
        client.agentTokenLaunch({
          name: request.name,
          symbol: request.symbol,
          description: request.description,
          ...(request.imageBase64 === undefined ? {} : { imageBase64: request.imageBase64 }),
          ...(request.twitterUrl === undefined ? {} : { twitterUrl: request.twitterUrl }),
          ...(request.telegramUrl === undefined ? {} : { telegramUrl: request.telegramUrl }),
          ...(request.websiteUrl === undefined ? {} : { websiteUrl: request.websiteUrl }),
        }),
      );
      const parsed = parseSunPumpShape(rawTokenSchema, tokenBody(payload));
      if (!isTokenRow(parsed)) {
        throw outcomeUnknown("SunPump accepted the launch and returned no token", request);
      }
      return mapToken(inSeconds(parsed));
    } catch (error) {
      if (isRefusal(error)) throw error;
      if (error instanceof CliError && error.code === "launch_outcome_unknown") throw error;
      if (error instanceof CliError && error.code === "timeout") {
        throw outcomeUnknown(
          `SunPump did not answer within ${this.timeoutMs} ms and may have created the token anyway`,
          request,
        );
      }
      throw outcomeUnknown(
        "the launch failed after it may have reached SunPump, which may have created the token anyway",
        request,
        failureOf(error),
      );
    }
  }
}

// Only usage errors, rate limits, API refusals, and HTTP 4xx permit a known-failure result.
function isRefusal(error: unknown): boolean {
  if (!(error instanceof CliError)) return false;
  if (error instanceof UsageError || error.code === "provider_rate_limited") return true;
  const details = (error.details ?? {}) as Record<string, unknown>;
  if (details.apiCode !== undefined) return true;
  const status = details.httpStatus;
  return typeof status === "number" && status >= 400 && status < 500;
}

// Expose only error code and HTTP status, without remote text.
function failureOf(error: unknown): Record<string, unknown> {
  if (!(error instanceof CliError)) return {};
  const status = (error.details as Record<string, unknown> | undefined)?.httpStatus;
  return { failure: error.code, ...(typeof status === "number" ? { httpStatus: status } : {}) };
}

// Search by symbol because SunPump chooses the owner.
function outcomeUnknown(
  reason: string,
  request: SunPumpTokenLaunchRequest,
  extra: Record<string, unknown> = {},
): ChainError {
  return new ChainError(
    "launch_outcome_unknown",
    `${reason}; run \`sunpump token-search ${JSON.stringify(request.symbol)}\` before launching again`,
    { name: request.name, symbol: request.symbol, ...extra },
  );
}

function tokenBody(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const record = payload as Record<string, unknown>;
  if (typeof record.contractAddress === "string") return record;
  const nested = record.token;
  return nested && typeof nested === "object" ? nested : record;
}

// Launch timestamps are already in seconds.
function inSeconds(raw: RawToken): RawToken {
  return raw;
}
