/**
 * SunSwap market records → this codebase's shapes.
 *
 * Three jobs, all of them shape and none of them meaning: fold the API's parallel `token*List`
 * arrays into one record per token, rename its fields to ours, and drop what a caller must not
 * see. Anything that needs to know what a value MEANS — resolving a symbol, computing a pair
 * price, deciding a page window — belongs in the use case above.
 *
 * Numbers are moved as text. They arrive as exact literals from the lossless parser, and every
 * step here either copies the characters or does string math on them, so a 25-digit value that
 * survived parsing survives mapping too.
 */
import { checkedTokenDecimals } from "../../../domain/amounts/index.js";
import type {
  PositionRecord,
  PositionTokenRecord,
  PoolRecord,
  PoolTokenRecord,
  TokenRecord,
} from "../../../application/ports/sunswap/market-data.js";
import { isLosslessNumber } from "lossless-json";
import type { RawPool, RawPosition, RawToken } from "./market-api.schema.js";
import { expandScientificNotation, toBaseUnitsTruncating } from "../../../domain/sunswap/amount.js";
import { describeHooks, V4_NO_HOOKS } from "../../../domain/sunswap/v4-pool.js";
import { decodeV4PoolParameters } from "@sun-protocol/sun-sdk-sunswap-v4";

/**
 * `extraInfo` members that stay integers because they are counts or tick indices, not money.
 *
 * Everything else numeric in `extraInfo` becomes a string: prices, amounts and liquidity all
 * outrun `number`, and `position_liquidity` in particular is the value a user copies into a
 * remove-liquidity call, where a rewritten digit costs them the position.
 */
const EXTRA_INTEGER_KEYS = new Set([
  "tick",
  "tickLower",
  "tickUpper",
  "lpTokenDecimals",
  "transaction1d",
  "transactionRecentTotal",
]);

/** consumed into `tokens[].rewardAmount`, so it must not also appear under `extra`. */
const EXTRA_CONSUMED_KEYS = new Set(["tokenRewardAmountList"]);

/** V3 and V4 positions are NFTs; one price per LP token describes nothing about them. */
const NFT_PROTOCOLS = new Set(["V3", "V4"]);

export function mapPosition(raw: RawPosition): PositionRecord {
  const protocol = raw.protocol ?? "";
  const decimals = (raw.tokenDecimalList ?? []).map((value) => checkedTokenDecimals(Number(value)));
  const rewards = readRewardAmounts(raw.extraInfo);
  const tokens = (raw.tokenAddressList ?? []).map((address, index): PositionTokenRecord => {
    const scale = decimals[index] ?? 0;
    const reward = rewards[index];
    return {
      address,
      symbol: raw.tokenSymbolList?.[index] ?? "",
      name: raw.tokenNameList?.[index] ?? "",
      decimals: scale,
      logo: raw.tokenLogoList?.[index] ?? "",
      amount: baseUnits(raw.userTokenAmountList?.[index], scale),
      priceUsd: plain(raw.tokenPriceUsdList?.[index] ?? ""),
      ...(reward === undefined ? {} : { rewardAmount: baseUnits(reward, scale) }),
    };
  });
  return {
    positionType: raw.positionType ?? "",
    protocol,
    poolAddress: raw.poolAddress ?? "",
    owner: raw.userAddress ?? "",
    poolFeeRate: plain(raw.poolFeeRate ?? ""),
    tokens,
    lpBalanceUsd: plain(raw.lpBalanceUsd ?? ""),
    lpBalanceAmount: plain(raw.lpBalanceAmount ?? ""),
    ...(NFT_PROTOCOLS.has(protocol) || raw.lpPriceUsd === undefined
      ? {}
      : { lpPriceUsd: plain(raw.lpPriceUsd) }),
    // Only V3 and V4 positions are NFTs. The service sends an EMPTY STRING rather than omitting
    // the field for the others, and publishing that would put a bare "#" in the id column and a
    // meaningless key in the json, so the key is absent for those protocols.
    ...(raw.nftTokenId === undefined || raw.nftTokenId === ""
      ? {}
      : { nftTokenId: raw.nftTokenId }),
    poolShare: plain(raw.poolShare ?? ""),
    status: raw.status ?? "",
    lpTokenSymbol: raw.lpTokenSymbol ?? "",
    lpTokenName: raw.lpTokenName ?? "",
    lastActiveAt: toUtcMinute(raw.lastActiveBlockTime ?? ""),
    extra: mapExtra(raw.extraInfo),
  };
}

/**
 * A liquidity pool.
 *
 * The parallel `token*List` arrays fold into `tokens[]`, and `extraInfo` becomes `extra` with
 * camelCased keys and NO attempt to normalise its shape: it genuinely differs per protocol, and
 * flattening a V3 tick and a CURVE LP address into one type would invent a common structure that
 * does not exist. What is dropped is what no caller can use — `id` and `contractIndex` are
 * database keys, `lpPriceUsd` is a constant 0 on V3/V4, and `swapRateList` is consumed by
 * `pairPrices` when a quote token was chosen.
 */
export function mapPool(raw: RawPool): PoolRecord {
  const decimals = (raw.tokenDecimalList ?? []).map((value) => checkedTokenDecimals(Number(value)));
  const tokens = (raw.tokenAddressList ?? []).map((address, index): PoolTokenRecord => {
    const scale = decimals[index] ?? 0;
    return {
      address,
      symbol: raw.tokenSymbolList?.[index] ?? "",
      name: raw.tokenNameList?.[index] ?? "",
      decimals: scale,
      logo: raw.tokenLogoList?.[index] ?? "",
      amount: baseUnits(raw.tokenAmountList?.[index], scale),
      priceUsd: plain(raw.tokenPriceUsdList?.[index] ?? ""),
      volume1d: baseUnits(raw.tokenAmountVol1dList?.[index], scale),
    };
  });
  return {
    poolAddress: raw.poolAddress ?? "",
    protocol: raw.protocol ?? "",
    poolType: raw.poolType ?? "",
    feeRate: plain(raw.feeRate ?? ""),
    protocolFeeRate: plain(raw.protocolFeeRate ?? ""),
    tokens,
    reserveUsd: plain(raw.reserveUsd ?? ""),
    reserveUsd1dRate: plain(raw.reserveUsd1dRate ?? ""),
    volumeUsd1d: plain(raw.volumeUsd1d ?? ""),
    volumeUsd1dRate: plain(raw.volumeUsd1dRate ?? ""),
    volumeUsd7d: plain(raw.volumeUsd7d ?? ""),
    volumeUsd7dRate: plain(raw.volumeUsd7dRate ?? ""),
    volumeUsd14d: plain(raw.volumeUsd14d ?? ""),
    feeUsd1d: plain(raw.feeUsd1d ?? ""),
    farmApr: plain(raw.farmApr ?? ""),
    feeApr: plain(raw.feeApr ?? ""),
    totalApr: plain(raw.totalApr ?? ""),
    transaction1d: Number(raw.transaction1d ?? 0),
    transaction1dRate: plain(raw.transaction1dRate ?? ""),
    transactionRecentTotal: Number(raw.transactionRecentTotal ?? 0),
    createdAt: epochMsToUtcMinute(raw.createBlockTimestamp ?? ""),
    createTxHash: raw.createTxHash ?? "",
    extra: { ...mapExtra(raw.extraInfo), ...v4PoolKeyParts(raw) },
    rates: raw.swapRateList ?? [],
  };
}

/**
 * The two parts of a V4 pool key the service does not publish in a usable form.
 *
 * `add-liquidity` names a V4 pool by its parts — pair, fee, TICK SPACING and HOOK — and neither of
 * the last two could be read off a pool row: the spacing was only inside the raw `parameters` word
 * (`0x…0a0000` is spacing 10) and the hook appeared, under `hooksAddress`, only when there was one.
 * So a caller could list a pool and still not know what to pass. Both are published here, DERIVED
 * from what the row already carries rather than fetched.
 *
 * The hook is rendered the way the domain renders it everywhere else: the word "none", never the
 * zero address — which on TRON is also the address the market API uses for native TRX, so printing
 * it would read as a pool hooked to the chain's own coin.
 */
function v4PoolKeyParts(raw: RawPool): Record<string, unknown> {
  const parameters = raw.extraInfo?.["parameters"];
  if (raw.protocol !== "V4" || typeof parameters !== "string") return {};
  const decoded = decodeV4PoolParameters(prefixed(parameters) as never) as {
    tickSpacing?: number;
  };
  const hooks = raw.extraInfo?.["hooks_address"] ?? raw.extraInfo?.["hooksAddress"];
  return {
    ...(typeof decoded.tickSpacing === "number" ? { tickSpacing: decoded.tickSpacing } : {}),
    hooks: describeHooks(typeof hooks === "string" && hooks !== "" ? hooks : V4_NO_HOOKS),
  };
}

const prefixed = (word: string): string => (word.startsWith("0x") ? word : `0x${word}`);

/**
 * A catalogue token.
 *
 * Three shape jobs: strip the redundant `token` prefix the service puts on half
 * its fields, rename the two `*List` members to what they hold, and drop `id`, which is an
 * internal row key no caller can use for anything.
 *
 * Counts stay numbers and everything money- or rate-shaped stays a string. `transaction1dRate`
 * sits next to `transaction1d` and goes the other way on purpose: the count is a count, the rate
 * is a ratio with more precision than a float keeps.
 */
export function mapToken(raw: RawToken): TokenRecord {
  return {
    address: raw.tokenAddress ?? "",
    symbol: raw.tokenSymbol ?? "",
    name: raw.tokenName ?? "",
    decimals: checkedTokenDecimals(Number(raw.tokenDecimal ?? 0)),
    logo: raw.tokenLogo ?? "",
    protocol: raw.protocol ?? "",
    priceUsd: plain(raw.tokenPriceUsd ?? ""),
    priceUsd1dRate: plain(raw.tokenPriceUsd1dRate ?? ""),
    reserveUsd: plain(raw.reserveUsd ?? ""),
    reserveUsd1dRate: plain(raw.reserveUsd1dRate ?? ""),
    volumeUsd1d: plain(raw.volumeUsd1d ?? ""),
    volumeUsd7d: plain(raw.volumeUsd7d ?? ""),
    volumeUsd14d: plain(raw.volumeUsd14d ?? ""),
    volumeUsd1dRate: plain(raw.volumeUsd1dRate ?? ""),
    volumeUsd7dRate: plain(raw.volumeUsd7dRate ?? ""),
    transaction1d: Number(raw.transaction1d ?? 0),
    transaction1dRate: plain(raw.transaction1dRate ?? ""),
    transactionRecentTotal: Number(raw.transactionRecentTotal ?? 0),
    relevantProtocols: raw.relevantProtocolList ?? [],
    relevantPools: raw.relevantPoolAddressList ?? [],
  };
}

/**
 * "2026-03-31 16:10:12" → "2026-03-31 16:10", by cutting the string.
 *
 * Deliberately NOT parsed as a date. The API sends no zone, so `new Date(...)` would read it in
 * whatever zone the machine happens to run in and could shift the value by hours — the same
 * listing would read differently in Taipei and in CI. Cutting characters is the only reading
 * that is identical everywhere.
 */
export function toUtcMinute(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2})/.exec(value.trim());
  return match?.[1]?.replace("T", " ") ?? value;
}

/**
 * epoch milliseconds → "YYYY-MM-DD HH:mm" in UTC.
 *
 * Unlike `toUtcMinute`, this value IS an instant, so it has to be converted rather than cut —
 * and it is converted in UTC explicitly, never through the machine's local zone.
 */
export function epochMsToUtcMinute(value: string): string {
  if (!/^\d+$/.test(value.trim())) return value;
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function mapExtra(extraInfo: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!extraInfo) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extraInfo)) {
    const name = camelCase(key);
    if (EXTRA_CONSUMED_KEYS.has(name)) continue;
    out[name] = mapExtraValue(name, value);
  }
  return out;
}

function mapExtraValue(name: string, value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => mapExtraValue(name, item));
  if (typeof value === "boolean" || value === null || value === undefined) return value;
  // A LosslessNumber is an object, so it has to be recognised BEFORE the nested-object branch:
  // passing one straight through would publish `{value: "392…588"}` where a digit string belongs.
  if (!isLosslessNumber(value) && typeof value === "object") return value;
  const text = String(value);
  if (EXTRA_INTEGER_KEYS.has(name)) {
    const numeric = Number(text);
    return Number.isSafeInteger(numeric) ? numeric : text;
  }
  return plain(text);
}

/** the API's `token_reward_amount_list`, before it is folded into the token records. */
function readRewardAmounts(extraInfo: Record<string, unknown> | undefined): string[] {
  const list = extraInfo?.["token_reward_amount_list"];
  return Array.isArray(list) ? list.map((value) => String(value)) : [];
}

function baseUnits(value: string | undefined, decimals: number): string {
  if (value === undefined || value === "") return "0";
  return toBaseUnitsTruncating(expandScientificNotation(value), decimals);
}

/** a numeric literal as a plain decimal string — exponent form expanded, digits untouched. */
function plain(value: string): string {
  return expandScientificNotation(value);
}

/** `derived_token0_amount` → `derivedToken0Amount`; a name already camel is left alone. */
export function camelCase(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}
