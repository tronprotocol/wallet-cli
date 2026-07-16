import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import type { TronBlockService } from "../../../../application/use-cases/tron/block-service.js";
import { Schemas } from "../schemas/index.js";
import { TextFormatters } from "../render/index.js";

export const blockSpec: ChainSpec = {
  path: ["block"],
  network: "optional", wallet: "none", auth: "none",
  positionals: [{ field: "number" }],
  summary: "Get a block (latest if omitted)",
  baseFields: z.object({ number: Schemas.uintString().optional().describe("block number to fetch, in block height; omit to fetch the latest block") }),
  examples: [{ cmd: "wallet-cli block" }, { cmd: "wallet-cli block 12345" }],
  formatText: TextFormatters.block,
};

export const blockTronBinding = (svc: TronBlockService): FamilyBinding => ({
  run: async (_ctx, net, input) => svc.get(net, input.number),
});
