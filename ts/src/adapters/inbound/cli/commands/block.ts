import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import type { TronBlockService } from "../../../../application/use-cases/tron/block-service.js";
import type { EvmBlockService } from "../../../../application/use-cases/evm/block-service.js";
import { Schemas } from "../schemas/index.js";
import { TextFormatters } from "../render/index.js";

export const blockSpec: ChainSpec = {
  path: ["block"],
  network: "optional",
  wallet: "none",
  auth: "none",
  positionals: [{ field: "number" }],
  summary: "Get a block (latest if omitted)",
  description:
    "Get a block, or the latest block when no height is given.\n" +
    "JSON output is the node's own block object, so its shape differs by family: EVM reports\n" +
    "hex quantities and second-precision timestamps, TRON decimal values and milliseconds.\n" +
    "Text output is normalised across both.",
  baseFields: z.object({
    number: Schemas.uintString()
      .optional()
      .describe("block number to fetch, in block height; omit to fetch the latest block"),
  }),
  examples: [
    { cmd: "wallet-cli block" },
    { cmd: "wallet-cli block 12345 --network nile" },
    { cmd: "wallet-cli block 12345 --network sepolia" },
  ],
  formatText: TextFormatters.block,
};

export const blockTronBinding = (svc: TronBlockService): FamilyBinding => ({
  run: async (_ctx, net, input) => svc.get(net, input.number),
});

export const blockEvmBinding = (svc: EvmBlockService): FamilyBinding => ({
  run: async (_ctx, net, input) => svc.get(net, input.number),
});
