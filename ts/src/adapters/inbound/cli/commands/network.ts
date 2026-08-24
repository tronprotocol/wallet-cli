/**
 * Network command — list known networks. Neutral and not bound to one family.
 */
import { z } from "zod";
import type { CommandDefinition } from "../contracts/index.js";
import { CommandRegistry } from "../registry/index.js";
import { TextFormatters } from "../render/index.js";

function endpointHost(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

export function registerNetworkCommands(reg: CommandRegistry): void {
  const empty = z.object({});

  // ── networks ────────────────────────────────────────────────────────────────
  reg.add({
    path: ["networks"],
    network: "none",
    wallet: "none",
    auth: "none",
    summary: "List known networks",
    fields: empty,
    input: empty,
    examples: [{ cmd: "wallet-cli networks" }],
    formatText: TextFormatters.networks,
    run: async (ctx) =>
      ctx.networkRegistry.all().map((n) => ({
        id: n.id,
        alias: ctx.networkRegistry.aliasOf(n.id),
        family: n.family,
        chainId: n.chainId,
        feeModel: n.feeModel,
        // host only: an endpoint may carry an API key in its path, and this output is not a
        // secret surface. `config get networks` is the place to confirm a full URL.
        endpoint: endpointHost(n.httpEndpoint),
      })),
  } satisfies CommandDefinition);
}
