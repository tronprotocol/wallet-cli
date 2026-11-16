import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import type { CommandDefinition } from "../contracts/index.js";
import type { CommandRegistry } from "../registry/index.js";
import {
  PLUGIN_TRUST_NOTICE,
  type PluginInstallResult,
  type PluginInstallSource,
  type PluginListEntry,
  type PluginRemoveResult,
  type PluginService,
  type PluginUpdateResult,
} from "../../../../application/use-cases/plugin-service.js";
import type { PluginSourceRecord } from "../../../../domain/plugins/index.js";
import { sanitizeText } from "../render/scalars.js";

// A path starts with ".", "/" or "~"; a path ending in .tgz or .tar.gz is a packed archive. Anything
// else names a registry package.
export function parsePluginSource(text: string, cwd = process.cwd()): PluginInstallSource {
  const isPath = text.startsWith(".") || text.startsWith("/") || text.startsWith("~");
  if (!isPath) return { type: "registry", spec: text };
  const expanded = text === "~" || text.startsWith("~/") ? `${homedir()}${text.slice(1)}` : text;
  const path = isAbsolute(expanded) ? resolve(expanded) : resolve(cwd, expanded);
  return /\.(tgz|tar\.gz)$/i.test(path) ? { type: "archive", path } : { type: "directory", path };
}

function sourceText(source: PluginSourceRecord): string {
  return source.type === "registry" ? `${source.spec} (${source.registry})` : source.path;
}

function formatInstall(result: PluginInstallResult): string {
  return [
    `installed ${result.name} ${result.version} (plugin API ${result.apiVersion}.${result.apiRevision})`,
    `  commands: ${result.groups.join(", ")}`,
    `  source:   ${sourceText(result.source)}`,
    ...(result.integrity ? [`  integrity: ${result.integrity}`] : []),
    "",
    result.notice,
  ]
    .map(sanitizeText)
    .join("\n");
}

function formatList(entries: PluginListEntry[]): string {
  const rows = entries.map((e) => [
    e.name,
    e.version ?? "-",
    e.kind,
    e.state,
    e.groups.join(", ") || "-",
  ]);
  const head = ["NAME", "VERSION", "KIND", "STATE", "COMMANDS"];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const line = (cells: string[]) =>
    cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]!))).join("  ");
  const notes = entries.filter((e) => e.reason !== undefined).map((e) => `${e.name}: ${e.reason}`);
  return [line(head), ...rows.map(line), ...(notes.length ? ["", ...notes] : [])]
    .map(sanitizeText)
    .join("\n");
}

function formatUpdate(results: PluginUpdateResult[]): string {
  if (results.length === 0) return "no installed plugins";
  return results
    .map((r) => {
      switch (r.status) {
        case "updated":
          return `${r.name}: updated ${r.from} -> ${r.to}`;
        case "unchanged":
          return `${r.name}: unchanged at ${r.version}`;
        case "failed":
          return `${r.name}: failed [${r.code}] ${r.message}`;
      }
    })
    .map(sanitizeText)
    .join("\n");
}

function formatRemove(result: PluginRemoveResult): string {
  return sanitizeText(`removed ${result.name}${result.version ? ` ${result.version}` : ""}`);
}

const SOURCES =
  "<source> is a short name (sunswap means @tron-walletcli/plugin-sunswap), an npm package with an optional exact version or dist-tag (@scope/name@1.2.0), a local package directory (./my-plugin), or a packed archive (./my-plugin-1.0.0.tgz). Registry packages come from the pluginRegistry config key and must match the registry's SHA-512 integrity value; npm is never run.";

export function registerPluginCommands(registry: CommandRegistry, service: PluginService): void {
  // `source` is a yargs tail key, so the field has another name.
  const installFields = z.object({
    spec: z
      .string()
      .min(1)
      .describe("plugin to install: short name, npm package, directory or .tgz"),
  });
  registry.add({
    path: ["plugin", "install"],
    network: "none",
    wallet: "none",
    auth: "none",
    positionals: [{ field: "spec", placeholder: "source" }],
    summary: "Install a plugin",
    description: `Install a plugin and its command groups. ${SOURCES}\n\n${PLUGIN_TRUST_NOTICE}`,
    fields: installFields,
    input: installFields,
    examples: [
      { cmd: "wallet-cli plugin install sunswap" },
      { cmd: "wallet-cli plugin install @tron-walletcli/plugin-sunswap@1.0.0" },
      { cmd: "wallet-cli plugin install ./my-plugin-1.0.0.tgz" },
    ],
    formatText: formatInstall,
    run: async (ctx, _network, input) =>
      service.install(parsePluginSource(input.spec), ctx.config.pluginRegistry, ctx.deadline),
  } satisfies CommandDefinition<z.infer<typeof installFields>, PluginInstallResult>);

  const empty = z.object({});
  registry.add({
    path: ["plugin", "list"],
    network: "none",
    wallet: "none",
    auth: "none",
    summary: "List built-in and installed plugins",
    description:
      "List the built-in and installed plugins with their versions, plugin API numbers, command groups and state: ok, incompatible (with the side that needs an update) or broken (with the reason).",
    fields: empty,
    input: empty,
    examples: [{ cmd: "wallet-cli plugin list" }],
    formatText: formatList,
    run: async () => service.list(),
  } satisfies CommandDefinition<z.infer<typeof empty>, PluginListEntry[]>);

  const updateFields = z.object({
    name: z.string().min(1).optional().describe("installed plugin to update; omit to update all"),
  });
  registry.add({
    path: ["plugin", "update"],
    network: "none",
    wallet: "none",
    auth: "none",
    positionals: [{ field: "name" }],
    summary: "Update installed plugins from their sources",
    description:
      "Fetch each installed plugin again from the source it was installed from. A registry package pinned to an exact version stays unchanged. Without a name every installed plugin is updated; one failure does not stop the others, and the command fails with every result in error.details.results.",
    fields: updateFields,
    input: updateFields,
    examples: [{ cmd: "wallet-cli plugin update" }, { cmd: "wallet-cli plugin update sunswap" }],
    formatText: formatUpdate,
    run: async (ctx, _network, input) => service.update(input.name, ctx.deadline),
  } satisfies CommandDefinition<z.infer<typeof updateFields>, PluginUpdateResult[]>);

  const removeFields = z.object({
    name: z.string().min(1).describe("installed plugin to remove"),
  });
  registry.add({
    path: ["plugin", "remove"],
    network: "none",
    wallet: "none",
    auth: "none",
    positionals: [{ field: "name" }],
    summary: "Remove an installed plugin",
    description:
      "Remove an installed plugin and its command groups. Built-in plugins cannot be removed.",
    fields: removeFields,
    input: removeFields,
    examples: [{ cmd: "wallet-cli plugin remove sunswap" }],
    formatText: formatRemove,
    run: async (_ctx, _network, input) => service.remove(input.name),
  } satisfies CommandDefinition<z.infer<typeof removeFields>, PluginRemoveResult>);
}
