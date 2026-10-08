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
 * The response is mapped by the SAME mapper as the catalogue, so the receipt for a new token and
 * `sunpump token-info` for that token cannot drift apart in shape.
 */
import type { NetworkDescriptor } from "../../../domain/types/network.js";
import type {
  SunPumpTokenLaunchPort,
  SunPumpTokenLaunchRequest,
} from "../../../application/ports/sunpump/token-launch.js";
import type { SunPumpTokenRecord } from "../../../application/ports/sunpump/market-data.js";
import { ChainError } from "../../../domain/errors/index.js";
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
      throw new ChainError(
        "provider_error",
        "SunPump accepted the launch and returned no token; check `sunpump token-list --owner` before creating another",
      );
    }
    return mapToken(inSeconds(parsed));
  }
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
