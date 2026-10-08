/**
 * Text renderers for the SunSwap query commands.
 *
 * json always carries the full precision; these columns are what a person reads, so a USD unit
 * price keeps four decimals above a cent and four significant digits below it, and anything the
 * service did not answer is an em dash rather than a blank or a zero.
 */
import { formatAmount, formatDecimal, formatUsd, formatUsdPrice } from "./scalars.js";
import { query as keyValues, table } from "./layout.js";

/** what the service had no answer for — never a blank cell, never a silent zero. */
const EMPTY = "—";

interface PriceRow {
  readonly address: string;
  readonly priceUsd: string;
  readonly quotedAt: string;
}

interface PriceView {
  readonly prices: readonly PriceRow[];
  /** text-mode scaffolding, stripped before the JSON envelope; see output/index.ts stripView. */
  readonly view?: { readonly symbols?: Readonly<Record<string, string>> };
}

interface TokenRow {
  readonly address: string;
  readonly symbol: string;
  readonly name: string;
  readonly protocol: string;
  readonly priceUsd: string;
  readonly reserveUsd: string;
  readonly volumeUsd1d: string;
  readonly priceUsd1dRate: string;
}

interface TokenListView {
  readonly tokens: readonly TokenRow[];
  readonly pagination: { offset: number; limit: number; total: number | null };
}

/**
 * A rate arrives as a decimal fraction (-0.0043) and is read as a percentage (-0.43%).
 *
 * Two decimals, because a price move is a headline figure, not a settlement amount. An empty
 * value stays an em dash rather than becoming a confident 0.00%.
 */
function percent(value: string, digits: number): string {
  const numeric = Number(value);
  if (value === "" || !Number.isFinite(numeric)) return EMPTY;
  return `${(numeric * 100).toFixed(digits)}%`;
}

/**
 * "Tokens (limit 3, offset 0)" when nothing counted the rows, "Tokens (showing 2 of 3)" when
 * something did, "(none)" when there are none.
 *
 * The window is stated rather than implied because the service cannot count: without it, a short
 * page is indistinguishable from the end of the data.
 */
function listTitle(noun: string, count: number, page: TokenListView["pagination"]): string {
  if (count === 0) return "(none)";
  if (page.total !== null) return `${noun} (showing ${count} of ${page.total})`;
  return `${noun} (limit ${page.limit}, offset ${page.offset})`;
}

interface PoolRow {
  readonly poolAddress: string;
  readonly protocol: string;
  readonly feeRate: string;
  readonly reserveUsd: string;
  readonly volumeUsd1d: string;
  readonly totalApr: string;
  readonly tokens: readonly { address: string; symbol: string }[];
  readonly extra: Readonly<Record<string, unknown>>;
  readonly pairPrices?: readonly { base: string; quote: string; price: string }[];
}

interface PoolListView {
  readonly pools: readonly PoolRow[];
  readonly pagination: { offset: number; limit: number; total: number | null };
  /** text-mode scaffolding, stripped before the JSON envelope; see output/index.ts stripView. */
  readonly view?: { readonly quoteSymbol?: string };
}

/**
 * A FEE tier as a percentage with only the digits it needs — "0.05%", "0.3%", not "0.0500%".
 *
 * Fee tiers are how a caller tells apart two pools holding the same pair, so a tier has to read
 * as the number people quote it by. An APR is different and uses two decimals: it is an estimate
 * that moves hourly, and printing "3.13243%" claims a precision the number does not have.
 */
function rate(value: string): string {
  const numeric = Number(value);
  if (value === "" || !Number.isFinite(numeric)) return EMPTY;
  return `${Number((numeric * 100).toFixed(6))}%`;
}

/**
 * A V4 pool can price itself per swap, in which case the reported fee is 0 — which would render
 * as "0%" and read as a free pool. It is not free; the fee is simply not knowable in advance.
 */
function feeCell(pool: PoolRow): string {
  return pool.extra.isDynamicFee === true ? "dynamic" : rate(pool.feeRate);
}

/** "WTRX/USDT" — the pair, in the order the pool holds its tokens. */
function pairCell(pool: PoolRow): string {
  const symbols = pool.tokens.map((token) => token.symbol || "?");
  return symbols.length === 0 ? EMPTY : symbols.join("/");
}

/** the single pair price, or an em dash when the pool has no one pairwise rate. */
function priceCell(pool: PoolRow, quote: string): string {
  const entry = pool.pairPrices?.[0];
  if (!entry || pool.pairPrices?.length !== 1) return EMPTY;
  return `${trimZeros(entry.price)} ${quote}`;
}

/** 18 places is what the value carries; six is what a person reads. */
/**
 * A decimal shortened to six places, KEEPING any exponent.
 *
 * The exponent has to be split off before the fraction is cut, or it is cut with it. An earlier
 * version sliced `"2.939544628365392e-39"` into `"2.939544"` — a full-range V4 position's lower
 * price bound, printed 39 orders of magnitude too high and looking entirely plausible. The JSON was
 * right; only the text lied.
 */
function trimZeros(value: string): string {
  const match = /^(-?\d+(?:\.\d+)?)([eE][+-]?\d+)$/.exec(value.trim());
  const [mantissa, exponent] = match ? [match[1]!, match[2]!.toLowerCase()] : [value, ""];
  if (!mantissa.includes(".")) return `${mantissa}${exponent}`;
  const [whole = "0", fraction = ""] = mantissa.split(".");
  const shown = fraction.slice(0, 6).replace(/0+$/, "");
  return `${shown === "" ? whole : `${whole}.${shown}`}${exponent}`;
}

interface PositionRow {
  readonly protocol: string;
  readonly status: string;
  readonly poolShare: string;
  readonly lpBalanceUsd: string;
  readonly nftTokenId?: string;
  readonly tokens: readonly { symbol: string }[];
  readonly extra: Readonly<Record<string, unknown>>;
}

interface PositionListView {
  readonly positions: readonly PositionRow[];
  readonly pagination: { offset: number; limit: number; total: number | null };
}

/**
 * A V3/V4 position whose liquidity is gone but whose NFT is still held.
 *
 * The range status of such a position says nothing — there is nothing in range — so the column
 * reports EMPTY instead. The json keeps the source `status` untouched, and a script should read
 * `extra.positionLiquidity` rather than this cell, which is a rendering and not a status value.
 */
function statusCell(position: {
  readonly status: string;
  readonly extra: Readonly<Record<string, unknown>>;
}): string {
  if (position.extra.positionLiquidity === "0") return "EMPTY";
  return position.status || EMPTY;
}

/**
 * The share of the pool this position holds.
 *
 * The data source occasionally reports a share above 100%, which cannot be true; rather than
 * print an impossible number the cell goes blank and the json keeps the source value for anyone
 * investigating it.
 */
function shareCell(value: string): string {
  const numeric = Number(value);
  if (value === "" || !Number.isFinite(numeric) || numeric > 1) return EMPTY;
  return percent(value, 4);
}

interface PositionTokenDetail {
  readonly symbol: string;
  readonly decimals: number;
  readonly amount: string;
  readonly rewardAmount?: string;
}

interface PositionInfoView {
  readonly position: {
    readonly nftTokenId: string;
    readonly owner: string;
    readonly poolAddress: string;
    readonly protocol: string;
    readonly status: string;
    readonly lpBalanceAmount: string;
    readonly lpBalanceUsd?: string;
    readonly poolShare?: string;
    readonly poolFeeRate: string;
    readonly tokens: readonly PositionTokenDetail[];
    readonly extra: Readonly<Record<string, unknown>>;
  };
}

/** both sides joined on one line: "984,154.975046 U / 976,580.959229 USDT". */
function sides(
  tokens: readonly PositionTokenDetail[],
  pick: (token: PositionTokenDetail) => string | undefined,
): string {
  const parts = tokens.map((token) => {
    const raw = pick(token);
    return raw === undefined ? undefined : `${formatAmount(raw, token.decimals)} ${token.symbol}`;
  });
  return parts.some((part) => part === undefined) ? EMPTY : parts.join(" / ");
}

/** a tick bound as a price, trimmed to what a person reads; the json keeps every digit. */
function bound(value: unknown): string {
  return typeof value === "string" ? trimZeros(value) : EMPTY;
}

export const SunSwapFormatters = {
  /**
   * The Position column is the id the liquidity commands take as `--position-id`. Only V3 and V4
   * positions are NFTs and have one; the rest are identified by their pool, so an em dash here
   * means "no id exists", not "unknown".
   */
  sunswapPositionList: (value: PositionListView): string => {
    const header = listTitle("Positions", value.positions.length, value.pagination);
    if (value.positions.length === 0) return header;
    return [
      header,
      table(
        ["Position", "Pair", "Protocol", "Status", "Value (USD)", "Share", "Unclaimed (USD)"],
        value.positions.map((position) => [
          position.nftTokenId === undefined ? EMPTY : `#${position.nftTokenId}`,
          position.tokens.map((token) => token.symbol || "?").join("/") || EMPTY,
          position.protocol || EMPTY,
          statusCell(position),
          `$${formatUsd(position.lpBalanceUsd)}`,
          shareCell(position.poolShare),
          // fees accrue into the LP token on the full-range protocols, so there is no separate
          // unclaimed amount to show — an em dash, not a zero.
          typeof position.extra.tokenRewardUsd === "string"
            ? `$${formatUsd(position.extra.tokenRewardUsd)}`
            : EMPTY,
        ]),
      ),
    ].join("\n");
  },

  /**
   * One position, one field per line.
   *
   * Every cell that could be absent is an em dash rather than a zero, and for the same reason it
   * is absent from the json: a USD value nobody could measure is not zero dollars, and unclaimed
   * fees nobody could read are not no fees. `Pool` is printed in full on both protocols — on V4
   * it is a 64-hex pool id, and a truncated identifier is one nobody can paste anywhere.
   */
  sunswapPositionInfo: (value: PositionInfoView): string => {
    const p = value.position;
    const quote = p.tokens[1]?.symbol ?? "?";
    const base = p.tokens[0]?.symbol ?? "?";
    return keyValues([
      ["Position", `#${p.nftTokenId}`],
      ["Owner", p.owner],
      ["Pool", p.poolAddress],
      ["Protocol", p.protocol || EMPTY],
      ["Status", statusCell(p)],
      ["Pair", p.tokens.map((token) => token.symbol || "?").join("/") || EMPTY],
      ["Amounts", sides(p.tokens, (token) => token.amount)],
      ["Value", p.lpBalanceUsd === undefined ? EMPTY : `$${formatUsd(p.lpBalanceUsd)}`],
      [
        "Price range",
        `${bound(p.extra.minPrice)} – ${bound(p.extra.maxPrice)} ${quote} per ${base}`,
      ],
      ["Tick range", `[${String(p.extra.tickLower)}, ${String(p.extra.tickUpper)}]`],
      ["Liquidity", formatDecimal(p.lpBalanceAmount)],
      [
        "Unclaimed",
        `${sides(p.tokens, (token) => token.rewardAmount)}${
          typeof p.extra.tokenRewardUsd === "string"
            ? `  ($${formatUsd(p.extra.tokenRewardUsd)})`
            : ""
        }`,
      ],
      ["Pool share", p.poolShare === undefined ? EMPTY : shareCell(p.poolShare)],
      ["Pool fee", p.extra.isDynamicFee === true ? "dynamic" : rate(p.poolFeeRate)],
    ]);
  },

  /**
   * The Pool column is printed in full, never shortened. On V4 it is a 64-hex pool id rather than
   * a contract address, and a truncated identifier is one nobody can paste into the next command.
   *
   * The price column appears only with --token, because only then is there a token to quote in.
   * A pool with more than two tokens has no single pairwise rate, so it shows an em dash and the
   * json is the authority.
   */
  sunswapPoolList: (value: PoolListView): string => {
    const header = listTitle("Pools", value.pools.length, value.pagination);
    if (value.pools.length === 0) return header;
    const quote = value.view?.quoteSymbol;
    const headers = [
      "Pool",
      "Pair",
      "Protocol",
      "Fee",
      ...(quote ? [`Price (${quote})`] : []),
      "TVL (USD)",
      "Vol 24h (USD)",
      "APR",
    ];
    return [
      header,
      table(
        headers,
        value.pools.map((pool) => [
          pool.poolAddress,
          pairCell(pool),
          pool.protocol || EMPTY,
          feeCell(pool),
          ...(quote ? [priceCell(pool, quote)] : []),
          `$${formatUsd(pool.reserveUsd)}`,
          `$${formatUsd(pool.volumeUsd1d)}`,
          percent(pool.totalApr, 2),
        ]),
      ),
    ].join("\n");
  },

  /**
   * Each row is a token WITHIN one protocol scope, which is why `Protocol` is a column rather
   * than a heading: an ALL row and a V3 row for the same token report different numbers and
   * overlap, so they can be listed together but never added together.
   *
   * The Address column is not optional. The catalogue contains tokens whose symbol AND name both
   * match a real one, so those two columns cannot tell an impersonation from the token it copies.
   */
  sunswapTokenList: (value: TokenListView): string => {
    const header = listTitle("Tokens", value.tokens.length, value.pagination);
    if (value.tokens.length === 0) return header;
    return [
      header,
      table(
        [
          "Symbol",
          "Name",
          "Address",
          "Protocol",
          "Price (USD)",
          "TVL (USD)",
          "Vol 24h (USD)",
          "24h change",
        ],
        value.tokens.map((token) => [
          token.symbol || EMPTY,
          token.name || EMPTY,
          token.address,
          token.protocol || EMPTY,
          `$${formatUsdPrice(token.priceUsd)}`,
          `$${formatUsd(token.reserveUsd)}`,
          `$${formatUsd(token.volumeUsd1d)}`,
          percent(token.priceUsd1dRate, 2),
        ]),
      ),
    ].join("\n");
  },

  /**
   * The Address column is not decoration and is never dropped: a catalogue symbol is what a
   * contract calls itself, and an impersonation of USDT is listed as "USDT" too. The address is
   * the only column that identifies the token.
   */
  sunswapPrice: (value: PriceView): string =>
    table(
      ["Symbol", "Address", "Price (USD)", "Quoted at (UTC)"],
      value.prices.map((price) => [
        value.view?.symbols?.[price.address] ?? EMPTY,
        price.address,
        `$${formatUsdPrice(price.priceUsd)}`,
        price.quotedAt === "" ? EMPTY : price.quotedAt,
      ]),
    ),
};
