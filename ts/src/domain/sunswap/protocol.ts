/**
 * SunSwap protocol scopes.
 *
 * A scope is not a filter over one dataset — it decides which statistics a row reports. `ALL`
 * combines every protocol; `V3` reports only what happened inside V3. The two are not
 * comparable, and rows from different scopes must never be added together.
 *
 * Normalising and rejecting locally is not politeness. The service accepts an unknown or
 * lower-case value and answers with an EMPTY list rather than an error, so a typo would read as
 * "this token trades nowhere" — a wrong answer that looks like a real one.
 */
import { UsageError } from "../errors/index.js";

export const SUNSWAP_PROTOCOLS = ["ALL", "V1", "V1_5", "V2", "V3", "V4", "CURVE"] as const;

export type SunSwapProtocol = (typeof SUNSWAP_PROTOCOLS)[number];

/**
 * The protocols a pool or position can belong to.
 *
 * `ALL` is absent on purpose. Where `--protocol` FILTERS rows, "all of them" is spelled by
 * omitting the flag, and there is no such protocol to belong to. It means something else
 * entirely on the token listings — see `SUNSWAP_SCOPES`.
 */
export const SUNSWAP_PROTOCOL_FILTERS = SUNSWAP_PROTOCOLS.filter(
  (value) => value !== "ALL",
) as readonly SunSwapProtocol[];

/**
 * The statistic scopes a token row can be measured in.
 *
 * Here `ALL` is a real member and the default: it means "combined across every protocol", which
 * changes what the numbers ARE rather than which rows appear. That is why the two sets cannot be
 * merged — the same word does not mean the same thing on both.
 */
export const SUNSWAP_SCOPES = SUNSWAP_PROTOCOLS;

/**
 * Upper-case and check against the set the CALLER permits; anything else is a usage error naming
 * the choices it was checked against.
 *
 * The permitted set is a parameter rather than the whole enum, because two commands can spell the
 * same flag and mean different things by it. One enum serving both is how `--protocol ALL` came
 * to be accepted by commands whose help and `--json-schema` said it was not a value — harmless
 * that day, and exactly the kind of gap a generated script settles into before anyone notices.
 */
export function normaliseProtocol(
  value: string,
  permitted: readonly SunSwapProtocol[] = SUNSWAP_PROTOCOLS,
): SunSwapProtocol {
  const upper = value.trim().toUpperCase();
  if (!permitted.includes(upper as SunSwapProtocol)) {
    throw new UsageError("invalid_value", `--protocol must be one of ${permitted.join(", ")}`);
  }
  return upper as SunSwapProtocol;
}

/**
 * A V4 pool is identified by a 64-hex id rather than a base58 address, so anything that accepts
 * "a pool" has to tell the two apart. A leading 0x is accepted and stripped: the ids appear both
 * ways in explorers, and refusing one spelling would be a papercut with no safety value.
 */
export function isPoolId(value: string): boolean {
  return /^(0x)?[0-9a-fA-F]{64}$/.test(value.trim());
}

/** the canonical spelling of a pool id: 64 hex characters, no prefix. */
export function normalisePoolId(value: string): string {
  return value.trim().replace(/^0x/, "");
}
