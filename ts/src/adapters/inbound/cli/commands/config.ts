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
import { CREDENTIAL_CONFIG_KEYS } from "../../../../domain/config/index.js";

export function registerConfigCommands(registry: CommandRegistry, service: ConfigService): void {
  const declared = service.credentials;
  const credentialKeys = [
    ...CREDENTIAL_CONFIG_KEYS,
    ...declared.map((c) => c.key),
    "networks.<id>.apiKey",
  ];
  const keyList = (keys: readonly string[]) =>
    keys.length === 1 ? keys[0] : `${keys.slice(0, -1).join(", ")} or ${keys.at(-1)}`;
  const pluginKeys =
    declared.length === 0
      ? ""
      : ` Plugin credentials: ${declared.map((c) => `${c.key}: ${c.summary}`).join("; ")}.`;
  const fields = z.object({
    // Network IDs and aliases make config paths open-ended; the service validates them.
    key: z
      .string()
      .min(1)
      .optional()
      .describe(
        `config key to read or set (${[...CONFIG_KEYS, ...declared.map((c) => c.key)].join(", ")}, or networks.<id> / networks.<id>.{${NETWORK_CONFIG_FIELDS.join(" | ")}}); omit to show the whole effective config`,
      ),
    value: z
      .string()
      .min(1)
      .optional()
      .describe("new value; omit to read the key; credentials use --api-key-stdin instead"),
  });

  registry.add({
    path: ["config"],
    network: "none",
    wallet: "none",
    auth: "none",
    interactive: true,
    promptHints: { key: "skip", value: "skip" },
    stdin: "apiKey",
    summary: "Show / get / set configuration values",
    description: `Read or update configuration. Credentials (${credentialKeys.join(", ")}) are read only from --api-key-stdin, never from the command line, and are masked in output; a config file holding one must have mode 0600. timeoutMs is the whole-command deadline in milliseconds (0 = no limit).${pluginKeys}`,
    positionals: [{ field: "key" }, { field: "value" }],
    fields,
    input: fields,
    examples: [
      { cmd: "wallet-cli config" },
      { cmd: "wallet-cli config defaultNetwork" },
      { cmd: "wallet-cli config defaultNetwork tron:3448148188" },
      { cmd: "wallet-cli config networks.tron:728126428" },
      { cmd: "wallet-cli config networks.tron:728126428.apiKeyHeader TRON-PRO-API-KEY" },
      {
        cmd: "printf '%s\\n' \"$TRONLINK_SECRET_ID\" | wallet-cli config tronlinkSecretId --api-key-stdin",
      },
    ],
    formatText: TextFormatters.config,
    run: async (ctx, _network, input) => {
      const hasApiKeyInput = ctx.secrets.has("apiKey");
      if (input.key !== undefined) service.assertKnownKey(input.key);
      const credential = input.key !== undefined && service.isCredentialKey(input.key);
      if (credential && input.value !== undefined) {
        throw new UsageError(
          "invalid_option",
          `${input.key} must not be passed on the command line; use --api-key-stdin`,
        );
      }
      if (hasApiKeyInput && !credential) {
        throw new UsageError(
          "invalid_option",
          `--api-key-stdin is accepted only with a credential key: ${keyList(credentialKeys)}`,
        );
      }
      const effectiveInput = hasApiKeyInput
        ? { key: input.key, value: ctx.secrets.require("apiKey") }
        : input;
      return service.execute(effectiveInput, ctx.config, ctx.networkRegistry);
    },
  } satisfies CommandDefinition);
}
