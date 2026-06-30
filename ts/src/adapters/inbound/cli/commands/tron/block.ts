/**
 * TRON block group — block lookup.
 */
import { z } from "zod";
import type { CommandDefinition } from "../../contracts/index.js";
import type { TronBlockService } from "../../../../../application/use-cases/tron/block-service.js";
import { TextFormatters } from "../../render/index.js";

function blockGet(service: TronBlockService): CommandDefinition {
  const fields = z.object({ number: z.coerce.number().int().nonnegative().optional().describe("block number to fetch, in block height; omit to fetch the latest block") });
  return {
    path: ["block"], family: "tron",
    network: "optional", wallet: "none", auth: "none",
    summary: "get a block (latest if omitted)", fields, input: fields,
    examples: [
      { cmd: "wallet-cli block --network nile" },
      { cmd: "wallet-cli block 12345 --network nile" },
    ],
    formatText: TextFormatters.block,
    run: async (_ctx, net, input) => service.get(net!, input.number),
  };
}

export function blockCommands(service: TronBlockService): CommandDefinition[] {
  return [blockGet(service)];
}
