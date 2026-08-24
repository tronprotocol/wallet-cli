import { z } from "zod";
import type { CommandDefinition } from "../contracts/index.js";
import {
  CONFIG_KEYS,
  type ConfigService,
} from "../../../../application/use-cases/config-service.js";
import { CommandRegistry } from "../registry/index.js";
import { TextFormatters } from "../render/index.js";

export function registerConfigCommands(registry: CommandRegistry, service: ConfigService): void {
  const fields = z.object({
    // Not an enum: `networks.<id>.httpEndpoint` is a nested path, and the id segment is
    // open-ended (any canonical id or alias). The service validates the key and names the
    // supported ones, so a typo gets a precise message rather than a yargs enum dump.
    key: z
      .string()
      .min(1)
      .optional()
      .describe(
        `config key to read or set (${CONFIG_KEYS.join(", ")}, or networks.<id>.httpEndpoint); omit to show the whole effective config`,
      ),
    value: z.string().min(1).optional().describe("new value; omit to read the key"),
  });

  registry.add({
    path: ["config"],
    network: "none",
    wallet: "none",
    auth: "none",
    summary: "Show / get / set configuration values",
    positionals: [{ field: "key" }, { field: "value" }],
    fields,
    input: fields,
    examples: [
      { cmd: "wallet-cli config" },
      { cmd: "wallet-cli config defaultNetwork" },
      { cmd: "wallet-cli config defaultNetwork tron:nile" },
    ],
    formatText: TextFormatters.config,
    run: async (ctx, _network, input) => service.execute(input, ctx.config, ctx.networkRegistry),
  } satisfies CommandDefinition);
}
