import { z } from "zod";
import type { CommandDefinition } from "../contracts/index.js";
import {
  CONFIG_KEYS,
  NETWORK_CONFIG_FIELDS,
  type ConfigService,
} from "../../../../application/use-cases/config-service.js";
import { CommandRegistry } from "../registry/index.js";
import { TextFormatters } from "../render/index.js";
import { UsageError } from "../../../../domain/errors/index.js";

export function registerConfigCommands(registry: CommandRegistry, service: ConfigService): void {
  const fields = z.object({
    // Not an enum: `networks.<id>[.<field>]` is a nested path, and the id segment is
    // open-ended (any canonical id or alias). The service validates the key and names the
    // supported ones, so a typo gets a precise message rather than a yargs enum dump.
    key: z
      .string()
      .min(1)
      .optional()
      .describe(
        `config key to read or set (${CONFIG_KEYS.join(", ")}, or networks.<id> / networks.<id>.{${NETWORK_CONFIG_FIELDS.join(" | ")}}); omit to show the whole effective config`,
      ),
    value: z.string().min(1).optional().describe("new value; omit to read the key"),
  });

  registry.add({
    path: ["config"],
    network: "none",
    wallet: "none",
    auth: "none",
    stdin: "apiKey",
    summary: "Show / get / set configuration values",
    positionals: [{ field: "key" }, { field: "value" }],
    fields,
    input: fields,
    examples: [
      { cmd: "wallet-cli config" },
      { cmd: "wallet-cli config defaultNetwork" },
      { cmd: "wallet-cli config defaultNetwork tron:3448148188" },
      { cmd: "wallet-cli config networks.tron:728126428" },
      { cmd: "wallet-cli config networks.tron:728126428.apiKeyHeader TRON-PRO-API-KEY" },
      { cmd: "printf '%s\\n' \"$BAI_KEY\" | wallet-cli config baiApiKey --api-key-stdin" },
    ],
    formatText: TextFormatters.config,
    run: async (ctx, _network, input) => {
      const hasApiKeyInput = ctx.secrets.has("apiKey");
      if (input.key === "baiApiKey" && input.value !== undefined) {
        throw new UsageError(
          "invalid_option",
          "B.AI API key must not be passed on the command line; use --api-key-stdin",
        );
      }
      if (hasApiKeyInput && input.key !== "baiApiKey") {
        throw new UsageError(
          "invalid_option",
          "--api-key-stdin is accepted only with config baiApiKey",
        );
      }
      const effectiveInput = hasApiKeyInput
        ? { key: "baiApiKey", value: ctx.secrets.require("apiKey") }
        : input;
      return service.execute(effectiveInput, ctx.config, ctx.networkRegistry);
    },
  } satisfies CommandDefinition);
}
