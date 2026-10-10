/**
 * Zod shapes for the SunSwap market API responses.
 *
 * The SDK client returns `unknown`, so this is where a response stops being whatever the remote
 * sent and becomes something with a checked shape.
 *
 * Every numeric field is captured as an opaque LITERAL, never as a `number`. The body is parsed
 * with `lossless-json`, so a numeric arrives as a `LosslessNumber` holding the exact source text;
 * `literal` records that text verbatim. Doing arithmetic — or even letting Zod coerce — would
 * reintroduce the float truncation the lossless parser exists to prevent: `position_liquidity`
 * is 21 digits and `lpBalanceUsd` 25, and `number` keeps 15.
 *
 * Unknown keys pass validation but never reach a caller: the mapper forwards an explicit list,
 * so the API can add fields without breaking us and without leaking them into our contract.
 */
import { z } from "zod";
import { isLosslessNumber } from "lossless-json";

/**
 * A numeric field, kept as the exact characters the remote sent.
 *
 * Accepts the three forms one can arrive in: a `LosslessNumber` (the normal case under the
 * lossless parser), a plain string (fields the API already quotes), and a `number` (only if a
 * caller parsed with `JSON.parse` — the value is already damaged by then, but rejecting it here
 * would turn a precision bug into a crash and hide which field lost digits).
 */
export const literal = z
  .union([z.string(), z.number(), z.custom<unknown>(isLosslessNumber)])
  .transform((value) => String(value));

const literalArray = z.array(literal);

/** `data.meta` — the server's paging answer. */
export const metaSchema = z
  .object({
    pageNo: literal.optional(),
    pageSize: literal.optional(),
    returnSize: literal.optional(),
    sort: z.string().optional(),
    hasMore: z.boolean().optional(),
  })
  .loose();

export const rawPositionSchema = z
  .object({
    positionType: z.string().optional(),
    protocol: z.string().optional(),
    poolAddress: z.string().optional(),
    userAddress: z.string().optional(),
    poolFeeRate: literal.optional(),
    tokenAddressList: z.array(z.string()).optional(),
    userTokenAmountList: literalArray.optional(),
    lpBalanceUsd: literal.optional(),
    lpBalanceAmount: literal.optional(),
    lpPriceUsd: literal.optional(),
    nftTokenId: literal.optional(),
    extraInfo: z.record(z.string(), z.unknown()).optional(),
    poolShare: literal.optional(),
    status: z.string().optional(),
    lpTokenSymbol: z.string().optional(),
    lpTokenName: z.string().optional(),
    lastActiveBlockTime: z.string().optional(),
    tokenNameList: z.array(z.string()).optional(),
    tokenSymbolList: z.array(z.string()).optional(),
    tokenDecimalList: literalArray.optional(),
    tokenLogoList: z.array(z.string()).optional(),
    tokenPriceUsdList: literalArray.optional(),
  })
  .loose();

export const positionsResponseSchema = z
  .object({
    list: z.array(rawPositionSchema).default([]),
    meta: metaSchema.optional(),
  })
  .loose();

export type RawPosition = z.infer<typeof rawPositionSchema>;
export type PositionsResponse = z.infer<typeof positionsResponseSchema>;

/**
 * `/apiv2/price` answers with an OBJECT keyed by address, not a list, and quotes each one under
 * `quote.USD`. A missing or unpriced address simply does not appear, which is not an error: the
 * service also returns a successful `"0"` for an address it has never heard of.
 */
export const pricesResponseSchema = z.record(
  z.string(),
  z
    .object({
      quote: z
        .object({
          USD: z
            .object({ last_updated: literal.optional(), price: literal.optional() })
            .loose()
            .optional(),
        })
        .loose()
        .optional(),
    })
    .loose(),
);

export const rawTokenSchema = z
  .object({
    protocol: z.string().optional(),
    tokenAddress: z.string().optional(),
    tokenName: z.string().optional(),
    tokenSymbol: z.string().optional(),
    tokenLogo: z.string().optional(),
    tokenDecimal: literal.optional(),
    tokenPriceUsd: literal.optional(),
    tokenPriceUsd1dRate: literal.optional(),
    reserveUsd: literal.optional(),
    reserveUsd1dRate: literal.optional(),
    volumeUsd1d: literal.optional(),
    volumeUsd1dRate: literal.optional(),
    volumeUsd7d: literal.optional(),
    volumeUsd7dRate: literal.optional(),
    volumeUsd14d: literal.optional(),
    transaction1d: literal.optional(),
    transaction1dRate: literal.optional(),
    transactionRecentTotal: literal.optional(),
    relevantPoolAddressList: z.array(z.string()).optional(),
    relevantProtocolList: z.array(z.string()).optional(),
  })
  .loose();

/** `/apiv2/tokens` and `/apiv2/tokens/search` answer with the same record shape. */
export const tokensResponseSchema = z
  .object({
    list: z.array(rawTokenSchema).default([]),
    meta: metaSchema.optional(),
  })
  .loose();

export type RawToken = z.infer<typeof rawTokenSchema>;

export type PricesResponse = z.infer<typeof pricesResponseSchema>;

export const rawPoolSchema = z
  .object({
    protocol: z.string().optional(),
    poolAddress: z.string().optional(),
    poolType: z.string().optional(),
    createBlockTimestamp: literal.optional(),
    createTxHash: z.string().optional(),
    feeRate: literal.optional(),
    protocolFeeRate: literal.optional(),
    tokenAddressList: z.array(z.string()).optional(),
    tokenAmountList: literalArray.optional(),
    tokenAmountVol1dList: literalArray.optional(),
    tokenNameList: z.array(z.string()).optional(),
    tokenSymbolList: z.array(z.string()).optional(),
    tokenDecimalList: literalArray.optional(),
    tokenLogoList: z.array(z.string()).optional(),
    tokenPriceUsdList: literalArray.optional(),
    swapRateList: literalArray.optional(),
    reserveUsd: literal.optional(),
    reserveUsd1dRate: literal.optional(),
    volumeUsd1d: literal.optional(),
    volumeUsd1dRate: literal.optional(),
    volumeUsd7d: literal.optional(),
    volumeUsd7dRate: literal.optional(),
    volumeUsd14d: literal.optional(),
    feeUsd1d: literal.optional(),
    farmApr: literal.optional(),
    feeApr: literal.optional(),
    totalApr: literal.optional(),
    transaction1d: literal.optional(),
    transaction1dRate: literal.optional(),
    transactionRecentTotal: literal.optional(),
    extraInfo: z.record(z.string(), z.unknown()).optional(),
  })
  .loose();

/** `/apiv2/pools` and `/apiv2/pools/search` answer with the same record shape. */
export const poolsResponseSchema = z
  .object({
    list: z.array(rawPoolSchema).default([]),
    meta: metaSchema.optional(),
  })
  .loose();

/** `/apiv2/pools/search/count` answers with a bare number under `data`. */
export const poolCountSchema = literal;

export type RawPool = z.infer<typeof rawPoolSchema>;
