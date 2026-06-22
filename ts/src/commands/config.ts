/**
 * Config command group (L4) — get/set top-level CLI config. Not chain-bound, no --network.
 * Uses ConfigLoader/AtomicFileStore directly. (plan §3 L4 中立命令群組 / §7.11)
 */
import { z } from "zod";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { existsSync, readFileSync } from "node:fs";
import type { CommandDefinition } from "../core/types/index.js";
import { CommandRegistry } from "../runtime/registry/index.js";
import { ConfigLoader } from "../infra/config/index.js";
import { AtomicFileStore } from "../core/fs/index.js";
import { UsageError } from "../core/errors/index.js";

export function registerConfigCommands(reg: CommandRegistry): void {
  const empty = z.object({});

  // ── config get ────────────────────────────────────────────────────────────────
  const configGetFields = z.object({
    key: z.string().min(1).optional().describe("config key to read (omit = whole config)"),
  });
  reg.add({
    id: "config.get", path: ["get"], network: "none", wallet: "none", auth: "none",
    summary: "show effective config (or one --key)", fields: configGetFields, input: configGetFields,
    examples: [{ cmd: "wallet-cli config get --key defaultOutput" }],
    run: async (ctx, _net, input) => {
      const all: Record<string, unknown> = {
        defaultOutput: ctx.config.defaultOutput,
        timeoutMs: ctx.config.timeoutMs,
        networks: Object.keys(ctx.config.networks),
      };
      if (input.key === undefined) return all;
      if (!(input.key in all)) throw new UsageError("invalid_value", `unknown config key: ${input.key}`);
      return { key: input.key, value: all[input.key] };
    },
  } satisfies CommandDefinition);

  // ── config set ──────────────────────────────────────────────────────────────────
  const configSetFields = z.object({
    key: z.enum(["defaultOutput", "timeoutMs"]).describe("config key"),
    value: z.string().min(1).describe("new value"),
  });
  reg.add({
    id: "config.set", path: ["set"], network: "none", wallet: "none", auth: "none",
    summary: "set a top-level config value", fields: configSetFields, input: configSetFields,
    examples: [{ cmd: "wallet-cli config set --key defaultOutput --value json" }],
    run: async (_ctx, _net, input) => {
      const path = ConfigLoader.configPath();
      const store = new AtomicFileStore();
      return store.withLock(path, () => {
        const current = existsSync(path) ? (parseYaml(readFileSync(path, "utf8")) ?? {}) : {};
        if (input.key === "timeoutMs") {
          const n = Number(input.value);
          if (!Number.isFinite(n) || n < 0) throw new UsageError("invalid_value", "timeoutMs must be a non-negative number");
          current.timeoutMs = n;
        } else {
          if (input.value !== "text" && input.value !== "json")
            throw new UsageError("invalid_value", "defaultOutput must be 'text' or 'json'");
          current.defaultOutput = input.value;
        }
        store.writeText(path, stringifyYaml(current));
        return { key: input.key, value: input.value };
      });
    },
  } satisfies CommandDefinition);
}
