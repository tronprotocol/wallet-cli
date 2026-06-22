/**
 * TRON block group (L4) — block lookup.
 */
import { z } from "zod";
import type { CommandDefinition } from "../../core/types/index.js";
import { rpcOf } from "./shared.js";

function blockGet(): CommandDefinition {
  const fields = z.object({ number: z.coerce.number().int().nonnegative().optional().describe("block number (default: latest)") });
  return {
    id: "tron.block.get", path: ["block", "get"], family: "tron",
    network: "optional", wallet: "none", auth: "none",
    summary: "get a block (latest if omitted)", fields, input: fields,
    examples: [{ cmd: "wallet-cli tron block get --network nile" }],
    run: async (_ctx, net, input) => ({ block: await rpcOf(net!).getBlock(input.number) }),
  };
}

export function blockCommands(): CommandDefinition[] {
  return [blockGet()];
}
