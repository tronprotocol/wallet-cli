/**
 * Zod shapes for the SunPump API responses.
 *
 * The SDK client returns `unknown` and the SDK declares no response types at all, so this file is
 * where a SunPump body stops being whatever the remote sent and becomes a checked shape.
 *
 * Every numeric field is captured as an opaque LITERAL, never as a `number`. The body is parsed
 * with `lossless-json`, so a numeric arrives as a `LosslessNumber` holding the exact source text
 * and `literal` records that text verbatim. It matters on both ends of the range here: a supply
 * is 10^27 base units once scaled, and a price arrives as `3.4242223848341e-05`.
 *
 * Unknown keys pass validation but never reach a caller — a token object carries forty fields and
 * the mapper forwards an explicit list, so the API can add more without breaking us and without
 * leaking operational columns into our contract.
 */
import { z } from "zod";
import { isLosslessNumber } from "lossless-json";

/**
 * A numeric field, kept as the exact characters the remote sent.
 *
 * The three arriving forms: a `LosslessNumber` (the normal case), a plain string, and a `number`
 * (only if someone parsed with `JSON.parse` — already damaged, but rejecting it here would turn a
 * precision bug into a crash and hide which field lost digits).
 */
export const literal = z
  .union([z.string(), z.number(), z.custom<unknown>(isLosslessNumber)])
  .transform((value) => String(value));

/** a literal that may also be explicitly null — most of this API's numerics can be. */
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
