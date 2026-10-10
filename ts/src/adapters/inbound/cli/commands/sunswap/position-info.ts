import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../../contracts/command.js";
import type { SunSwapPositionInfoService } from "../../../../../application/use-cases/tron/sunswap/position-info-service.js";
import { TextFormatters } from "../../render/index.js";

/**
 * V3 or V4, and nothing else — refused before anything is asked of a node.
 *
 * V2, V1, V1_5 and CURVE positions are not NFTs and have no id, so there is no "unsupported
 * protocol" here to fall through to at runtime: naming one is a mistake about what a position id
 * IS, and the message says so rather than listing four more values that would never work.
 *
 * Case is normalised because `v4` is what a person types and the value is an enum, not an
 * identifier — but the accepted set is still exactly two.
 */
const protocolField = z
  .string()
  .transform((value) => value.trim().toUpperCase())
  .pipe(
    z.enum(["V3", "V4"], {
      message:
        "--protocol must be V3 or V4; V2, V1, V1_5 and CURVE positions are not NFTs and have no id",
    }),
  )
  .describe("protocol version: V3 or V4");

/**
 * The NFT id, as a STRING.
 *
 * Not `z.coerce.number()`: an id is an unbounded uint256, and a number would round one past fifteen
 * digits into a different position. What is checked is the shape — digits only, no sign, no point —
 * so a malformed id is a usage error at parse time rather than a revert a caller pays for.
 */
const positionIdField = z
  .string()
  .refine((value) => /^\d+$/.test(value.trim()), {
    message: "--position-id must be a non-negative whole number: it is an NFT id, not an address",
  })
  .describe("the position NFT id: the Position (#N) in 'sunswap position-list'");

const fields = z.object({
  protocol: protocolField,
  positionId: positionIdField,
});

export const sunswapPositionInfoSpec: ChainSpec = {
  path: ["sunswap", "position-info"],
  network: "optional",
  wallet: "none",
  auth: "none",
  /**
   * The CONTRACTS, not the market API.
   *
   * The data API is mainnet-only. This implementation reads the position manager and the pool
   * instead, and those exist on every network the liquidity commands
   * already work on — so the gate is the same one they use, and the USD fields are absent where
   * there is no price source rather than the whole command being refused.
   */
  capability: "sunswap.liquidity",
  rejectsAccount:
    "position-info looks up a position by its id and reports whoever holds it, so it is not about any account of yours",
  summary: "Show one SunSwap V3 or V4 position",
  description:
    "Show the details of a SunSwap V3 or V4 position: who holds it, its pair, its price range,\n" +
    "its liquidity and the fees it has not yet claimed.\n" +
    "Everything is read from the chain by NFT id, so no account is needed and none is accepted.\n" +
    "V3 and V4 number their positions separately, which is why --protocol is required: the same\n" +
    "id names a different position under each.\n" +
    "V2, V1, V1_5 and CURVE positions have no id at all; list them with 'sunswap position-list'.\n" +
    "USD values need a price source and appear on mainnet only; everything else works wherever\n" +
    "the SunSwap contracts are configured.",
  baseFields: fields,
  examples: [
    { cmd: "wallet-cli sunswap position-info --protocol V4 --position-id 88" },
    { cmd: "wallet-cli sunswap position-info --protocol V3 --position-id 1845" },
  ],
  formatText: TextFormatters.sunswapPositionInfo,
};

export const sunswapPositionInfoTronBinding = (
  service: SunSwapPositionInfoService,
): FamilyBinding => ({
  run: async (ctx, net, input) =>
    service.positionInfo(ctx, net, {
      protocol: input.protocol,
      positionId: input.positionId,
    }),
});
