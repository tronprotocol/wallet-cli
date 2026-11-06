import { formatAmount, formatDecimal, formatUsd, formatUsdPrice } from "./scalars.js";
import { query as keyValues, table } from "./layout.js";

const EMPTY = "—";

interface PriceRow {
  readonly address: string;
  readonly priceUsd: string;
  readonly quotedAt: string;
}

interface PriceView {
  readonly prices: readonly PriceRow[];
  // Display metadata; omitted from JSON output.
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

// Input is a fractional rate; display percentage points.
function percent(value: string, digits: number): string {
  const numeric = Number(value);
  if (value === "" || !Number.isFinite(numeric)) return EMPTY;
  return `${(numeric * 100).toFixed(digits)}%`;
}

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
  // Display metadata; omitted from JSON output.
  readonly view?: { readonly quoteSymbol?: string };
}

function rate(value: string): string {
  const numeric = Number(value);
  if (value === "" || !Number.isFinite(numeric)) return EMPTY;
  return `${Number((numeric * 100).toFixed(6))}%`;
}

// A dynamic fee reported as zero does not mean swaps are free.
function feeCell(pool: PoolRow): string {
  return pool.extra.isDynamicFee === true ? "dynamic" : rate(pool.feeRate);
}

function pairCell(pool: PoolRow): string {
  const symbols = pool.tokens.map((token) => token.symbol || "?");
  return symbols.length === 0 ? EMPTY : symbols.join("/");
}

function priceCell(pool: PoolRow, quote: string): string {
  const entry = pool.pairPrices?.[0];
  if (!entry || pool.pairPrices?.length !== 1) return EMPTY;
  return `${trimZeros(entry.price)} ${quote}`;
}

// Preserve the exponent when truncating a price mantissa.
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

// Zero-liquidity NFTs display EMPTY regardless of range status.
function statusCell(position: {
  readonly status: string;
  readonly extra: Readonly<Record<string, unknown>>;
}): string {
  if (position.extra.positionLiquidity === "0") return "EMPTY";
  return position.status || EMPTY;
}

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

function bound(value: unknown): string {
  return typeof value === "string" ? trimZeros(value) : EMPTY;
}

export const SunSwapFormatters = {
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
          // Full-range protocols accrue fees inside LP tokens; there is no separate unclaimed amount.
          typeof position.extra.tokenRewardUsd === "string"
            ? `$${formatUsd(position.extra.tokenRewardUsd)}`
            : EMPTY,
        ]),
      ),
    ].join("\n");
  },

  // Unavailable amounts are not zero; keep full pool IDs for reuse in commands.
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

  // Keep full pool identifiers so they can be reused in commands.
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

  // Protocol scopes overlap; do not sum them. Addresses distinguish same-name tokens.
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

  // Symbols can be impersonated; addresses identify tokens.
  sunswapPrice: (value: PriceView): string =>
    value.prices.length === 0
      ? "(none)"
      : table(
          ["Symbol", "Address", "Price (USD)", "Quoted at (UTC)"],
          value.prices.map((price) => [
            value.view?.symbols?.[price.address] ?? EMPTY,
            price.address,
            `$${formatUsdPrice(price.priceUsd)}`,
            price.quotedAt === "" ? EMPTY : price.quotedAt,
          ]),
        ),
};
