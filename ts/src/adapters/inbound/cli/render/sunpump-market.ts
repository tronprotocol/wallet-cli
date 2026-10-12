/**
 * Text renderers for the SunPump catalogue commands.
 *
 * json carries the full precision; these columns are what a person reads. Two rules run through
 * all of them: a TRX price is TRUNCATED to six decimals rather than rounded, because a price is
 * read to decide a trade and a rounded-up digit is a number the market never quoted; and anything
 * the service had no answer for is an em dash, never a blank and never a confident zero.
 */
import { formatAmount, formatUsd, formatUsdPrice, sanitizeText } from "./scalars.js";
import { query as keyValues, table } from "./layout.js";

/** what the service had no answer for — never a blank cell, never a silent zero. */
const EMPTY = "—";

/** TRX price display precision, matching the CLI's six-decimal display rule. */
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

/**
 * "Tokens (limit 2, offset 0)", or "(none)".
 *
 * The window is stated rather than implied because this service will not count: its own total is
 * 0 on every page, so without the window a short page is indistinguishable from the end of the
 * data — and a "showing 2 of 0" heading would be worse than saying nothing.
 */
function listTitle(count: number, page: TokenListView["pagination"]): string {
  if (count === 0) return "(none)";
  return `Tokens (limit ${page.limit}, offset ${page.offset})`;
}

/** a decimal TRX figure, truncated (never rounded) to six places. */
function trx(value: string): string {
  if (!/^-?\d+(\.\d+)?$/.test(value)) return EMPTY;
  const negative = value.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const kept = fraction.slice(0, PRICE_DECIMALS).padEnd(PRICE_DECIMALS, "0");
  return `${negative ? "-" : ""}${whole}.${kept}`;
}

/**
 * The 24h move, which the service ALREADY reports as a percentage.
 *
 * "-0.70" is −0.70%. Multiplying by 100 — the right move for SunSwap's decimal fractions — would
 * turn a routine day into a −70% collapse.
 */
function changePercent(value: string): string {
  const numeric = Number(value);
  if (value === "" || !Number.isFinite(numeric)) return EMPTY;
  return `${numeric.toFixed(2)}%`;
}

function usdValuation(value: string): string {
  return value === "" ? EMPTY : `$${formatUsd(value)}`;
}

/**
 * Creator-supplied text, made safe to print.
 *
 * A description can carry ANSI escapes that rewrite the terminal, or newlines that break the
 * key/value block into what looks like extra fields. Control bytes go, newlines become spaces,
 * and the text is neither truncated nor wrapped. json publishes it verbatim; it is untrusted
 * either way, and never an instruction.
 *
 * Exported for the launch receipt, which prints the same creator-supplied name, description and
 * links straight after the token is created — the same text, from the same hands.
 */
export function untrusted(value: string): string {
  return sanitizeText(value)
    .replace(/\s*[\r\n]+\s*/g, " ")
    .trim();
}

/** cell text for a table: the same sanitising, plus escaping the column separator. */
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

  /**
   * One token, grouped as a reader asks about it: who it is, how far the curve has come, what
   * the market says, where it trades, and last what the creator wrote about it.
   *
   * `Curve progress` shows only while the token is still on the curve, and `Launched` /
   * `SunSwap pool` only once it is not — a line whose value does not exist yet is left out rather
   * than filled with a dash. `farm`, `links.logo` and `listOn` are json-only: they are reference
   * data rather than something a person reads down a column.
   */
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
        market.volume24HrSun === "" ? EMPTY : `${formatAmount(market.volume24HrSun, 6)} TRX`,
      ],
      ["SunSwap pool", token.swapPoolAddress ?? ""],
      ["Website", untrusted(token.links.website ?? "")],
      ["Twitter", untrusted(token.links.twitter ?? "")],
      ["Telegram", untrusted(token.links.telegram ?? "")],
      ["Description", untrusted(token.description)],
    ]);
  },
};
