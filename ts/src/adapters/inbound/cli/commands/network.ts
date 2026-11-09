import { z } from "zod";
import type { CommandDefinition } from "../contracts/index.js";
import { CommandRegistry } from "../registry/index.js";
import { TextFormatters } from "../render/index.js";
import { endpointHost } from "../../../../domain/types/index.js";

export function registerNetworkCommands(reg: CommandRegistry): void {
  const empty = z.object({});

  reg.add({
    path: ["networks"],
    network: "none",
    wallet: "none",
    auth: "none",
    summary: "List known networks",
    description:
      "List known networks with their family, chain id, fee model and endpoint host.\n" +
      "Network is the canonical CAIP-2 id (namespace:reference); Alias is the short name\n" +
      "--network also accepts. Endpoints are shown as hosts only.",
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
        // Hide URL paths because endpoints may contain API keys.
        endpoint: endpointHost(n.httpEndpoint),
      })),
  } satisfies CommandDefinition);
}
