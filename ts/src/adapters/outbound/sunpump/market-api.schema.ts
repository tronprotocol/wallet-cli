import { z } from "zod";
import { isLosslessNumber } from "lossless-json";

// Preserve numeric text; plain number inputs may already have lost precision.
export const literal = z
  .union([z.string(), z.number(), z.custom<unknown>(isLosslessNumber)])
  .transform((value) => String(value));

const nullableLiteral = literal.nullable();

const nullableString = z.string().nullable();

export const rawTokenSchema = z
  .object({
    contractAddress: nullableString.optional(),
    ownerAddress: nullableString.optional(),
    swapPoolAddress: nullableString.optional(),
    symbol: nullableString.optional(),
    name: nullableString.optional(),
    description: nullableString.optional(),
    logoUrl: nullableString.optional(),
    twitterUrl: nullableString.optional(),
    telegramUrl: nullableString.optional(),
    websiteUrl: nullableString.optional(),
    status: nullableString.optional(),
    decimals: nullableLiteral.optional(),
    totalSupply: nullableLiteral.optional(),
    currentSold: nullableLiteral.optional(),
    tokenReserve: nullableLiteral.optional(),
    trxReserve: nullableLiteral.optional(),
    pumpPercentage: nullableLiteral.optional(),
    priceInTrx: nullableLiteral.optional(),
    priceChange24Hr: nullableLiteral.optional(),
    volume24Hr: nullableLiteral.optional(),
    marketCap: nullableLiteral.optional(),
    virtualLiquidity: nullableLiteral.optional(),
    trxPriceInUsd: nullableLiteral.optional(),
    tokenCreatedInstant: nullableLiteral.optional(),
    tokenLaunchedInstant: nullableLiteral.optional(),
    createTxHash: nullableString.optional(),
    launchTxHash: nullableString.optional(),
    stakeAddress: nullableString.optional(),
    stakeApy: nullableLiteral.optional(),
    listOn: z.record(z.string(), nullableString).nullable().optional(),
  })
  .loose();

export const tokensResponseSchema = z
  .object({
    tokens: z.array(rawTokenSchema).default([]),
  })
  .loose();

export type RawToken = z.infer<typeof rawTokenSchema>;
