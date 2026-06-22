/**
 * Chain command group (L4) — network listing. Neutral (not bound to one family). (plan §3 L4 中立命令群組)
 */
import { z } from "zod";
import type { CommandDefinition } from "../core/types/index.js";
import { CommandRegistry } from "../runtime/registry/index.js";

export function registerChainCommands(reg: CommandRegistry): void {
  const empty = z.object({});

  // ── chains list ───────────────────────────────────────────────────────────────
  reg.add({
    id: "chains.list", path: ["list"], network: "none", wallet: "none", auth: "none",
    summary: "list known networks", fields: empty, input: empty,
    examples: [{ cmd: "wallet-cli chains list" }],
    run: async (ctx) =>
      ctx.networkRegistry.all().map((n) => ({
        id: n.id, family: n.family, chainId: n.chainId, aliases: n.aliases, feeModel: n.feeModel,
      })),
  } satisfies CommandDefinition);
}
