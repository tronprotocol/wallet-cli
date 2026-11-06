// Preserve numeric literals as text; number coercion loses monetary precision.
import { z } from "zod";
import { isLosslessNumber } from "lossless-json";

// LosslessNumber and string inputs preserve digits; number inputs may already be rounded.
export const literal = z
  .union([z.string(), z.number(), z.custom<unknown>(isLosslessNumber)])
  .transform((value) => String(value));

const literalArray = z.array(literal);

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

// Unpriced addresses may be absent or carry a zero price.
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

export const poolsResponseSchema = z
  .object({
    list: z.array(rawPoolSchema).default([]),
    meta: metaSchema.optional(),
  })
  .loose();

export const poolCountSchema = literal;

export type RawPool = z.infer<typeof rawPoolSchema>;
