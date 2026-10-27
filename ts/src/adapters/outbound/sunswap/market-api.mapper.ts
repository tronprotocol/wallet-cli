// Keep monetary values as text to preserve every digit.
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

// Only counts and ticks may become numbers; monetary extras stay strings.
const EXTRA_INTEGER_KEYS = new Set([
  "tick",
  "tickLower",
  "tickUpper",
  "lpTokenDecimals",
  "transaction1d",
  "transactionRecentTotal",
]);

// Rewards appear in tokens, not again in extra.
const EXTRA_CONSUMED_KEYS = new Set(["tokenRewardAmountList"]);

// NFT positions have no per-LP-token price.
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
    // The API uses an empty string for positions without an NFT.
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

// V4 tick spacing is packed in parameters; an absent hook means no hooks.
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

// The API omits the timezone; preserve its wall-clock text without local-time conversion.
export function toUtcMinute(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2})/.exec(value.trim());
  return match?.[1]?.replace("T", " ") ?? value;
}

// Convert epoch milliseconds to UTC YYYY-MM-DD HH:mm.
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
  // LosslessNumber objects must become digit strings, not leak their object shape.
  if (!isLosslessNumber(value) && typeof value === "object") return value;
  const text = String(value);
  if (EXTRA_INTEGER_KEYS.has(name)) {
    const numeric = Number(text);
    return Number.isSafeInteger(numeric) ? numeric : text;
  }
  return plain(text);
}

function readRewardAmounts(extraInfo: Record<string, unknown> | undefined): string[] {
  const list = extraInfo?.["token_reward_amount_list"];
  return Array.isArray(list) ? list.map((value) => String(value)) : [];
}

function baseUnits(value: string | undefined, decimals: number): string {
  if (value === undefined || value === "") return "0";
  return toBaseUnitsTruncating(expandScientificNotation(value), decimals);
}

// Expand exponents without rounding digits.
function plain(value: string): string {
  return expandScientificNotation(value);
}

export function camelCase(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}
