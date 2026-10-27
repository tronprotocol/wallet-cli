// Supply, sold amounts, and token reserves arrive in whole tokens; volume arrives in TRX.
// Keep trxReserve and virtualLiquidity on their service-provided decimal scale.
import { checkedTokenDecimals } from "../../../domain/amounts/index.js";
import type {
  SunPumpFarmRecord,
  SunPumpLinksRecord,
  SunPumpTokenRecord,
} from "../../../application/ports/sunpump/market-data.js";
import { expandScientificNotation, toBaseUnitsTruncating } from "../../../domain/sunswap/amount.js";
import { multiplyDecimalTruncating } from "../../../domain/sunpump/market.js";
import type { RawToken } from "./market-api.schema.js";

const SUN_DECIMALS = 6;

const USD_PRICE_PLACES = 18;

// A missing contract address represents an unindexed token, even in a successful response.
export function isTokenRow(raw: RawToken | null | undefined): raw is RawToken {
  return Boolean(raw && typeof raw.contractAddress === "string" && raw.contractAddress !== "");
}

export function mapToken(raw: RawToken): SunPumpTokenRecord {
  const decimals = checkedTokenDecimals(Number(raw.decimals ?? 0));
  const trxPriceInUsd = plain(raw.trxPriceInUsd);
  const priceInTrx = plain(raw.priceInTrx);
  const launchedAt = utcMinuteFromSeconds(raw.tokenLaunchedInstant);
  const farm = mapFarm(raw);
  const listOn = mapListOn(raw.listOn);
  return {
    address: raw.contractAddress ?? "",
    symbol: raw.symbol ?? "",
    name: raw.name ?? "",
    decimals,
    totalSupply: baseUnits(raw.totalSupply, decimals),
    status: raw.status ?? "",
    owner: raw.ownerAddress ?? "",
    market: {
      marketCapUsd: plain(raw.marketCap),
      priceInTrx,
      priceChange24HrPercent: plain(raw.priceChange24Hr),
      volume24HrSun: baseUnits(raw.volume24Hr, SUN_DECIMALS),
      virtualLiquidity: plain(raw.virtualLiquidity),
      // Omit USD pricing when no conversion rate is supplied.
      ...(trxPriceInUsd === ""
        ? {}
        : {
            trxPriceInUsd,
            priceUsd: multiplyDecimalTruncating(priceInTrx, trxPriceInUsd, USD_PRICE_PLACES),
          }),
    },
    curve: {
      pumpPercentage: plain(raw.pumpPercentage),
      currentSold: baseUnits(raw.currentSold, decimals),
      tokenReserve: baseUnits(raw.tokenReserve, decimals),
      trxReserve: plain(raw.trxReserve),
    },
    ...(text(raw.swapPoolAddress) === "" ? {} : { swapPoolAddress: text(raw.swapPoolAddress) }),
    ...(farm === undefined ? {} : { farm }),
    createdAt: utcMinuteFromSeconds(raw.tokenCreatedInstant),
    ...(launchedAt === "" ? {} : { launchedAt }),
    createTxHash: text(raw.createTxHash),
    ...(text(raw.launchTxHash) === "" ? {} : { launchTxHash: text(raw.launchTxHash) }),
    description: text(raw.description),
    links: mapLinks(raw),
    ...(listOn === undefined ? {} : { listOn }),
  };
}

// APY alone does not identify a farm; require its contract address.
function mapFarm(raw: RawToken): SunPumpFarmRecord | undefined {
  const address = text(raw.stakeAddress);
  if (address === "") return undefined;
  return { address, apy: plain(raw.stakeApy) };
}

function mapLinks(raw: RawToken): SunPumpLinksRecord {
  const entries: [keyof SunPumpLinksRecord, string][] = [
    ["logo", text(raw.logoUrl)],
    ["twitter", text(raw.twitterUrl)],
    ["telegram", text(raw.telegramUrl)],
    ["website", text(raw.websiteUrl)],
  ];
  return Object.fromEntries(entries.filter(([, value]) => value !== ""));
}

// Blank URLs denote exchanges where the token is not listed.
function mapListOn(
  value: Record<string, string | null> | null | undefined,
): Record<string, string> | undefined {
  if (!value) return undefined;
  const listed = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "",
  );
  return listed.length === 0 ? undefined : Object.fromEntries(listed);
}

// Whole tokens or TRX to base units; missing values yield an empty string.
function baseUnits(value: string | null | undefined, decimals: number): string {
  const plainValue = plain(value);
  return plainValue === "" ? "" : toBaseUnitsTruncating(plainValue, decimals);
}

// Expand scientific notation and trim fractional zeros; missing values yield an empty string.
function plain(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const expanded = expandScientificNotation(String(value));
  if (!expanded.includes(".")) return expanded;
  return expanded.replace(/0+$/, "").replace(/\.$/, "");
}

function text(value: string | null | undefined): string {
  return value ?? "";
}

// Unix seconds to YYYY-MM-DD HH:mm UTC; absent, zero, or noninteger values yield an empty string.
export function utcMinuteFromSeconds(value: string | null | undefined): string {
  if (value === null || value === undefined || !/^\d+$/.test(String(value))) return "";
  const seconds = Number(value);
  if (seconds <= 0 || !Number.isSafeInteger(seconds)) return "";
  return new Date(seconds * 1000).toISOString().slice(0, 16).replace("T", " ");
}
