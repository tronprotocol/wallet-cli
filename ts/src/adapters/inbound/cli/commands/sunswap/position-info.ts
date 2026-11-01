import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../../contracts/command.js";
import type { SunSwapPositionInfoService } from "../../../../../application/use-cases/sunswap/position-info-service.js";
import { TextFormatters } from "../../render/index.js";

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

// Keep uint256 IDs as strings to avoid rounding to another position.
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
  // Gate on contracts: position reads do not require the mainnet market API.
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
    service.positionInfo(ctx.deadline, ctx, net, {
      protocol: input.protocol,
      positionId: input.positionId,
    }),
});
