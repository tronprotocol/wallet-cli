/**
 * SunPump catalogue rows → this codebase's shapes.
 *
 * Three jobs: rename the service's forty fields to ours, put every amount on a scale the name
 * states, and drop what a caller must not see.
 *
 * What is dropped, and why:
 *   - `holders` is not a real count. It is 0 on every token the service returns, and forwarding
 *     it would read as "nobody holds this".
 *   - `trxPriceInUsd` is null on both listings. Only the detail endpoint answers it, so
 *     `priceUsd` appears there and nowhere else rather than being faked from a missing rate.
 *   - `id`, `active`, `syncToTronScan*`, `dlive*`, `tweet*`, `tokenFlag` and
 *     `firstReachHillInstant` are operational columns, mostly null.
 *
 * The scales, all established against live responses rather than assumed. `totalSupply`,
 * `currentSold` and `tokenReserve` arrive as WHOLE TOKENS (a supply reads `1000000000` beside
 * `decimals: 18`) and are published as base units. `volume24Hr` arrives as TRX with six decimals
 * and is published as SUN. `trxReserve` and `virtualLiquidity` keep the service's own decimal
 * unit.
 *
 * Numbers are moved as text throughout: they arrive as exact literals from the lossless parser,
 * and every step here either copies the characters or does BigInt arithmetic on them.
 */
import { checkedTokenDecimals } from "../../../domain/amounts/index.js";
import type {
  SunPumpFarmRecord,
  SunPumpLinksRecord,
  SunPumpTokenRecord,
} from "../../../application/ports/sunpump/market-data.js";
import { expandScientificNotation, toBaseUnitsTruncating } from "../../../domain/sunswap/amount.js";
import { multiplyDecimalTruncating } from "../../../domain/sunpump/market.js";
import type { RawToken } from "./market-api.schema.js";

/** TRX has six decimals, so a TRX figure becomes SUN by shifting six places. */
const SUN_DECIMALS = 6;

/** What `priceUsd` is truncated to: the places `priceInTrx` itself carries. */
const USD_PRICE_PLACES = 18;

/**
 * A row with no `contractAddress` is not a token.
 *
 * The detail endpoint answers an address it has never indexed with HTTP 200, `code: 0` and a
 * null body; older rows in the same position have been observed as an all-null shell. Both are
 * "not found", and neither may be published as a successful answer full of nulls.
 */
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
      // Both or neither: a USD price with no rate behind it would be a number we invented.
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

/**
 * The farm, keyed on its ADDRESS being present.
 *
 * `stakeApy` alone is not evidence of one: the search endpoint sends `stakeApy: 0` and omits
 * `stakeAddress` entirely, and a farm published with no contract to stake at is not usable.
 */
function mapFarm(raw: RawToken): SunPumpFarmRecord | undefined {
  const address = text(raw.stakeAddress);
  if (address === "") return undefined;
  return { address, apy: plain(raw.stakeApy) };
}

/** creator-supplied links, empty members dropped rather than published as "". */
function mapLinks(raw: RawToken): SunPumpLinksRecord {
  const entries: [keyof SunPumpLinksRecord, string][] = [
    ["logo", text(raw.logoUrl)],
    ["twitter", text(raw.twitterUrl)],
    ["telegram", text(raw.telegramUrl)],
    ["website", text(raw.websiteUrl)],
  ];
  return Object.fromEntries(entries.filter(([, value]) => value !== ""));
}

/**
 * The exchange listings, with the empty ones removed.
 *
 * The service names every exchange it knows and leaves the URL blank for the ones a token is not
 * on, so forwarding the map verbatim would claim eight listings where there are three.
 */
function mapListOn(
  value: Record<string, string | null> | null | undefined,
): Record<string, string> | undefined {
  if (!value) return undefined;
  const listed = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "",
  );
  return listed.length === 0 ? undefined : Object.fromEntries(listed);
}

/** a whole-token (or TRX) decimal → base units; "" when the service answered nothing. */
function baseUnits(value: string | null | undefined, decimals: number): string {
  const plainValue = plain(value);
  return plainValue === "" ? "" : toBaseUnitsTruncating(plainValue, decimals);
}

/**
 * A numeric literal as plain decimal text: scientific notation expanded, trailing fractional
 * zeros dropped so `100.0` reads as `100`. Null and absent both become "".
 */
function plain(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const expanded = expandScientificNotation(String(value));
  if (!expanded.includes(".")) return expanded;
  return expanded.replace(/0+$/, "").replace(/\.$/, "");
}

function text(value: string | null | undefined): string {
  return value ?? "";
}

/**
 * Unix SECONDS → "YYYY-MM-DD HH:mm" UTC.
 *
 * Minute precision, matching every other timestamp this CLI prints. A null, a zero or a value
 * that is not an integer yields "", which callers turn into an absent key rather than into the
 * epoch — "1970-01-01 00:00" would read as a real launch date.
 */
export function utcMinuteFromSeconds(value: string | null | undefined): string {
  if (value === null || value === undefined || !/^\d+$/.test(String(value))) return "";
  const seconds = Number(value);
  if (seconds <= 0 || !Number.isSafeInteger(seconds)) return "";
  return new Date(seconds * 1000).toISOString().slice(0, 16).replace("T", " ");
}
