/**
 * Network command — list known networks. Neutral and not bound to one family.
 */
import { z } from "zod";
import type { CommandDefinition } from "../contracts/index.js";
import { CommandRegistry } from "../registry/index.js";
import { TextFormatters } from "../render/index.js";
import { endpointHost } from "../../../../domain/types/index.js";

export function registerNetworkCommands(reg: CommandRegistry): void {
  const empty = z.object({});

  // ── networks ────────────────────────────────────────────────────────────────
  reg.add({
    path: ["networks"],
    network: "none",
    wallet: "none",
    auth: "none",
    summary: "List known networks",
    // §2.3, adjusted to the six-column table this actually prints: the canonical id and the
    // alias are separate columns, so the description names both rather than only one.
    description:
      "List known networks with their family, chain id, fee model and endpoint host.\n" +
      "Network is the canonical id (family:chain-id); Alias is the short name --network\n" +
      "also accepts. Endpoints are shown as hosts only.",
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
