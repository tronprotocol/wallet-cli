/**
 * Network command — list known networks. Neutral and not bound to one family.
 */
import { z } from "zod";
import type { CommandDefinition } from "../contracts/index.js";
import { CommandRegistry } from "../registry/index.js";
import { TextFormatters } from "../render/index.js";

export function registerNetworkCommands(reg: CommandRegistry): void {
  const empty = z.object({});

  // ── networks ────────────────────────────────────────────────────────────────
  reg.add({
    path: ["networks"], network: "none", wallet: "none", auth: "none",
    summary: "List known networks", fields: empty, input: empty,
    examples: [{ cmd: "wallet-cli networks" }],
    formatText: TextFormatters.networks,
    run: async (ctx) =>
      ctx.networkRegistry.all().map((n) => ({
        id: n.id, family: n.family, chainId: n.chainId, feeModel: n.feeModel,
      })),
  } satisfies CommandDefinition);
}
