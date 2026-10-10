/**
 * SunPumpTokenLaunchPort over `@sun-protocol/sun-sdk-api` — `POST /ai/agentTokenLaunch`.
 *
 * The one write in this folder that signs nothing: the service creates the token, picks its owner
 * and pays for it. What this adapter owns is therefore narrow and unforgiving — the exact body
 * that goes out, and the difference between "created" and "refused".
 *
 * 🔴 Two traps, both of this service's own making:
 *
 * - It IGNORES what it does not understand. A misnamed body field is not an error; it is a token
 *   created without that field. So the body is assembled from the SDK's declared parameter names
 *   (`imageBase64`, `twitterUrl`, `telegramUrl`, `websiteUrl`) and an optional field is OMITTED
 *   rather than sent empty, so nothing is ever set to "".
 * - It refuses with HTTP 200 and a non-zero `code`. That is handled once, in `api-transport.ts`;
 *   an untranslated refusal here would be reported as a token that does not exist.
 *
 * And one of ours: the service deploys the token BEFORE it answers, so a call that times out, or
 * fails in any way short of the service saying no, has not failed — the token may well exist.
 * That is `launch_outcome_unknown` (retry `never`), not `timeout` or `provider_error` (retry
 * `same`), because resending creates a second, permanent token.
 *
 * The response is mapped by the SAME mapper as the catalogue, so the receipt for a new token and
 * `sunpump token-info` for that token cannot drift apart in shape.
 */
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
        // The request was ACCEPTED — the envelope said so — and we cannot name what was created.
        // Said plainly, because the token may well exist and the caller has to go and look.
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

/**
 * A failure that proves no token was created — the only failures passed through as they are.
 *
 * A WHITE-list on purpose. The service deploys before it answers, so once the request may have
 * left, every failure is "maybe created" unless the service said no: a refusal in its envelope
 * (`apiCode`), an HTTP 4xx including a rate limit, or a usage error raised before anything was
 * sent. A 5xx, a reset connection, a body that does not parse — none of those say the deploy did
 * not happen, and treating one as a retryable failure is how a second permanent token gets made.
 */
function isRefusal(error: unknown): boolean {
  if (!(error instanceof CliError)) return false;
  if (error instanceof UsageError || error.code === "provider_rate_limited") return true;
  const details = (error.details ?? {}) as Record<string, unknown>;
  if (details.apiCode !== undefined) return true;
  const status = details.httpStatus;
  return typeof status === "number" && status >= 400 && status < 500;
}

/** what went wrong, for `details` — the code and status only, never a message or a body. */
function failureOf(error: unknown): Record<string, unknown> {
  if (!(error instanceof CliError)) return {};
  const status = (error.details as Record<string, unknown> | undefined)?.httpStatus;
  return { failure: error.code, ...(typeof status === "number" ? { httpStatus: status } : {}) };
}

/**
 * A launch whose token may exist but was never named back to us.
 *
 * The lookup it points at is `token-search`, not `token-list --owner`: the owner is chosen by
 * SunPump, so the caller has no owner address to filter by — the symbol is what they know.
 */
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

/**
 * Where the created token sits in the response.
 *
 * `data` itself, which is how every other endpoint of this service answers, and `data.token` as a
 * second position. This is the one response in the group that could not be observed without
 * creating a real token on mainnet, so the reader accepts both rather than failing at the one
 * moment a failure is unrecoverable: by the time it is parsed, the token exists.
 */
function tokenBody(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const record = payload as Record<string, unknown>;
  if (typeof record.contractAddress === "string") return record;
  const nested = record.token;
  return nested && typeof nested === "object" ? nested : record;
}

/**
 * MEASURED, by creating a real token on mainnet 2026-09-28: this endpoint reports instants in PLAIN
 * SECONDS, exactly as every query endpoint of the same service does. No rescaling is needed and
 * none is applied.
 *
 * The create response does not use a different unit. Rescaling it by 1000 dates a token made that
 * minute to `+058709-10-27` — a date absurd enough to be caught, but only if someone looks: the
 * JSON still says `success: true`, and `token-info` reads the SAME token back correctly, so the two
 * paths disagree about one field while both look healthy.
 *
 * Kept as a named no-op rather than deleted so the next reader finds the measurement instead of
 * re-deriving the assumption. `token-info` and `launch` now share one scale, which is the property
 * that matters.
 */
function inSeconds(raw: RawToken): RawToken {
  return raw;
}
