// Loads installed plugins: manifests always, code only for the commands that need it.
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { InstalledPlugin, PluginStore } from "../../application/ports/plugin-store.js";
import type { PluginLoadState } from "../../application/use-cases/plugin-service.js";
import { ExecutionError, type CliError } from "../../domain/errors/index.js";
import { incompatiblePlugin, pluginCompatibility } from "../../domain/plugins/index.js";
import type { PluginCredential, PluginDefinition, PluginGroup } from "../../plugin-api/index.js";
import { publishPluginApi } from "./api-object.js";
import { registerPlugin, type PluginTargets } from "./host.js";

export type PluginImporter = (url: string) => Promise<{ default?: unknown }>;

// Which installed plugins this command imports.
export interface LoadScope {
  // --json-schema, full help and plugin list describe every command.
  readonly all: boolean;
  // The first command word; the plugin that owns it is imported.
  readonly word?: string;
}

interface Entry {
  readonly name: string;
  readonly plugin?: InstalledPlugin;
  state: PluginLoadState;
  failure?: CliError;
  // Groups this plugin holds; empty when it holds none.
  claims: readonly string[];
}

function broken(name: string, reason: string): ExecutionError {
  return new ExecutionError(
    "plugin_load_failed",
    `plugin ${name} could not be loaded: ${reason}; run plugin list for details, or reinstall it`,
    { plugin: name },
  );
}

export class PluginLoader {
  #entries: Entry[] = [];

  constructor(
    private readonly store: Pick<PluginStore, "list">,
    private readonly targets: PluginTargets,
    private readonly importer: PluginImporter = (url) => import(url),
  ) {}

  // Each plugin is handled on its own: a failure marks that plugin and the loader goes on.
  async load(scope: LoadScope, warn: (message: string) => void): Promise<void> {
    let stored;
    try {
      stored = this.store.list().sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    } catch (error) {
      warn(`installed plugins could not be read: ${messageOf(error)}`);
      return;
    }
    const taken = this.targets.commands.topLevelWords();
    for (const item of stored) {
      if (item.state === "unreadable") {
        this.#entries.push({
          name: item.name,
          state: { state: "broken", reason: item.reason },
          failure: broken(item.name, item.reason),
          claims: [],
        });
        continue;
      }
      const plugin = item.plugin;
      const entry: Entry = { name: plugin.name, plugin, state: { state: "ok" }, claims: [] };
      this.#entries.push(entry);
      const clash = plugin.groups.find((g) => taken.has(g.name));
      if (clash) {
        this.#fail(entry, `its command group "${clash.name}" is already taken`);
        continue;
      }
      entry.claims = plugin.groups.map((g) => g.name);
      for (const word of entry.claims) taken.add(word);
      const compatibility = pluginCompatibility(plugin.apiVersion, plugin.apiRevision);
      if (!compatibility.compatible) {
        entry.state = { state: "incompatible", reason: compatibility.reason };
        entry.failure = incompatiblePlugin(plugin.name, compatibility);
        continue;
      }
      if (!existsSync(plugin.entryPath)) this.#fail(entry, "its entry file is missing");
    }

    for (const entry of this.#entries) {
      if (entry.state.state !== "ok" || entry.plugin === undefined) continue;
      if (scope.all || (scope.word !== undefined && entry.claims.includes(scope.word))) {
        await this.#import(entry, entry.plugin);
      }
    }
    // Groups of plugins that were not imported are listed from their manifests.
    for (const entry of this.#entries) {
      if (entry.plugin === undefined || this.#imported.has(entry.name)) continue;
      if (entry.claims.length === 0 || scope.all) continue;
      for (const group of entry.plugin.groups) this.targets.commands.addGroup(group);
    }
    if (scope.all) {
      for (const entry of this.#entries) {
        if (entry.state.state !== "ok") {
          warn(`plugin ${entry.name} is ${entry.state.state}: ${entry.state.reason}`);
        }
      }
    }
  }

  #imported = new Set<string>();

  async #import(entry: Entry, plugin: InstalledPlugin): Promise<void> {
    publishPluginApi();
    let definition: unknown;
    try {
      definition = (await this.importer(pathToFileURL(plugin.entryPath).href)).default;
    } catch (error) {
      this.#fail(entry, `its entry file failed to load (${messageOf(error)})`);
      return;
    }
    // The definition is plugin code too: its getters may throw.
    try {
      const mismatch = definitionMismatch(definition, plugin);
      if (mismatch) {
        this.#fail(entry, mismatch);
        return;
      }
      const registration = registerPlugin(
        definition as PluginDefinition,
        this.targets,
        plugin.credentials,
      );
      if (!registration.ok) {
        this.#fail(entry, `its registration failed (${registration.reason})`);
        return;
      }
    } catch (error) {
      this.#fail(entry, `its definition could not be read (${messageOf(error)})`);
      return;
    }
    this.#imported.add(entry.name);
  }

  #fail(entry: Entry, reason: string): void {
    entry.state = { state: "broken", reason };
    entry.failure = broken(entry.name, reason);
  }

  state(name: string): PluginLoadState | undefined {
    return this.#entries.find((e) => e.name === name)?.state;
  }

  // The installed plugin that holds a command word, and why it cannot serve it.
  owner(word: string): { name: string; version: string; failure?: CliError } | undefined {
    const entry = this.#entries.find((e) => e.claims.includes(word));
    if (entry?.plugin === undefined) return undefined;
    return {
      name: entry.name,
      version: entry.plugin.version,
      ...(entry.failure === undefined ? {} : { failure: entry.failure }),
    };
  }
}

function nameOf(stored: { state: string; name?: string; plugin?: { name: string } }): string {
  return stored.plugin?.name ?? stored.name ?? "";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// The group fields that discovery reads, from the manifest or from the definition.
function groupKey(group: Partial<PluginGroup> | undefined): string {
  return JSON.stringify([
    group?.name,
    group?.summary,
    group?.description,
    Array.isArray(group?.families) ? [...group.families] : group?.families,
  ]);
}

function credentialKey(credential: Partial<PluginCredential> | undefined): string {
  return JSON.stringify([credential?.key, credential?.summary]);
}

// The module must be the plugin its manifest describes.
function definitionMismatch(definition: unknown, plugin: InstalledPlugin): string | undefined {
  if (typeof definition !== "object" || definition === null) {
    return "its entry file has no plugin definition as its default export";
  }
  const d = definition as Partial<PluginDefinition>;
  const groups = Array.isArray(d.groups) ? d.groups.map(groupKey) : [];
  const expected = plugin.groups.map(groupKey);
  const differs: string[] = [];
  if (d.name !== plugin.name) differs.push("name");
  if (d.version !== plugin.version) differs.push("version");
  if (d.apiVersion !== plugin.apiVersion) differs.push("apiVersion");
  if (d.apiRevision !== plugin.apiRevision) differs.push("apiRevision");
  if (groups.length !== expected.length || groups.some((g, i) => g !== expected[i])) {
    differs.push("groups");
  }
  // A definition without credentials declares none, as a manifest without them does.
  const credentials = d.credentials === undefined ? [] : d.credentials;
  const expectedCredentials = plugin.credentials.map(credentialKey);
  if (
    !Array.isArray(credentials) ||
    credentials.length !== expectedCredentials.length ||
    credentials.some((c, i) => credentialKey(c) !== expectedCredentials[i])
  ) {
    differs.push("credentials");
  }
  if (typeof d.register !== "function") differs.push("register");
  return differs.length === 0
    ? undefined
    : `its definition does not match its manifest (${differs.join(", ")})`;
}
