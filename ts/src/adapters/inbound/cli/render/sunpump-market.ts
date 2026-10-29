import { formatAmount, formatUsd, formatUsdPrice, sanitizeText } from "./scalars.js";
import { query as keyValues, table } from "./layout.js";
import { FAMILIES } from "../../../../domain/family/index.js";

const EMPTY = "—";

const PRICE_DECIMALS = 6;

interface MarketRow {
  readonly marketCapUsd: string;
  readonly priceInTrx: string;
  readonly priceChange24HrPercent: string;
  readonly volume24HrSun: string;
  readonly priceUsd?: string;
}

interface TokenRow {
  readonly address: string;
  readonly symbol: string;
  readonly name: string;
  readonly status: string;
  readonly owner: string;
  readonly market: MarketRow;
  readonly curve: { readonly pumpPercentage: string };
  readonly swapPoolAddress?: string;
  readonly createdAt: string;
  readonly launchedAt?: string;
  readonly description: string;
  readonly links: {
    readonly twitter?: string;
    readonly telegram?: string;
    readonly website?: string;
  };
}

interface TokenListView {
  readonly tokens: readonly TokenRow[];
  readonly pagination: { offset: number; limit: number; total: number | null };
}

interface TokenInfoView {
  readonly token: TokenRow;
}

// The service does not provide a reliable total; show the requested window.
function listTitle(count: number, page: TokenListView["pagination"]): string {
  if (count === 0) return "(none)";
  return `Tokens (limit ${page.limit}, offset ${page.offset})`;
}

// TRX prices truncate to six decimals.
function trx(value: string): string {
  if (!/^-?\d+(\.\d+)?$/.test(value)) return EMPTY;
  const negative = value.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const kept = fraction.slice(0, PRICE_DECIMALS).padEnd(PRICE_DECIMALS, "0");
  return `${negative ? "-" : ""}${whole}.${kept}`;
}

// The service reports percentage points, not a fractional rate.
function changePercent(value: string): string {
  const numeric = Number(value);
  if (value === "" || !Number.isFinite(numeric)) return EMPTY;
  return `${numeric.toFixed(2)}%`;
}

function usdValuation(value: string): string {
  return value === "" ? EMPTY : `$${formatUsd(value)}`;
}

// Sanitize creator text and flatten newlines to prevent forged terminal fields.
export function untrusted(value: string): string {
  return sanitizeText(value)
    .replace(/\s*[\r\n]+\s*/g, " ")
    .trim();
}

// Escape pipes so token text cannot forge table columns.
function cell(value: string): string {
  return untrusted(value).replace(/\|/g, "\\|");
}

export const SunPumpMarketFormatters = {
  sunpumpTokenList(value: TokenListView): string {
    const title = listTitle(value.tokens.length, value.pagination);
    if (value.tokens.length === 0) return title;
    const rows = value.tokens.map((token) => [
      cell(token.symbol) || EMPTY,
      cell(token.name) || EMPTY,
      token.address,
      token.status || EMPTY,
      trx(token.market.priceInTrx),
      usdValuation(token.market.marketCapUsd),
      changePercent(token.market.priceChange24HrPercent),
    ]);
    const body = table(
      ["Symbol", "Name", "Address", "Status", "Price (TRX)", "Market cap (USD)", "24h change"],
      rows,
    );
    return `${title}\n${body}`;
  },

  sunpumpTokenInfo(value: TokenInfoView): string {
    const token = value.token;
    const market = token.market;
    const price =
      market.priceUsd === undefined || market.priceUsd === ""
        ? `${trx(market.priceInTrx)} TRX`
        : `${trx(market.priceInTrx)} TRX ($${formatUsdPrice(market.priceUsd)})`;
    return keyValues([
      ["Symbol", cell(token.symbol)],
      ["Name", cell(token.name)],
      ["Address", token.address],
      ["Creator", token.owner],
      ["Status", token.status],
      [
        "Curve progress",
        token.status === "CREATED" && token.curve.pumpPercentage !== ""
          ? `${token.curve.pumpPercentage}%`
          : "",
      ],
      ["Created", token.createdAt === "" ? "" : `${token.createdAt} UTC`],
      ["Launched", token.launchedAt === undefined ? "" : `${token.launchedAt} UTC`],
      ["Price", price],
      ["Market cap", usdValuation(market.marketCapUsd)],
      ["24h change", changePercent(market.priceChange24HrPercent)],
      [
        "Vol 24h",
        market.volume24HrSun === ""
          ? EMPTY
          : `${formatAmount(market.volume24HrSun, FAMILIES.tron.nativeDecimals)} TRX`,
      ],
      ["SunSwap pool", token.swapPoolAddress ?? ""],
      ["Website", untrusted(token.links.website ?? "")],
      ["Twitter", untrusted(token.links.twitter ?? "")],
      ["Telegram", untrusted(token.links.telegram ?? "")],
      ["Description", untrusted(token.description)],
    ]);
  },
};
