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
    key: z.enum(CONFIG_KEYS).optional()
      .describe("config key to read or set; omit to show the whole effective config"),
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
