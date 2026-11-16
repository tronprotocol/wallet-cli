import { createHash } from "node:crypto";
import {
  classifyError,
  ExecutionError,
  type CliError,
  UsageError,
} from "../../domain/errors/index.js";
import {
  incompatiblePlugin,
  isPinned,
  parsePluginManifest,
  parseRegistrySpec,
  pluginCompatibility,
  pluginConflict,
  type PluginGroupManifest,
  type PluginManifest,
  type PluginSourceRecord,
} from "../../domain/plugins/index.js";
import type { DispatchCheck, ExecutionDeadline } from "../contracts/deadline.js";
import { withErrorDetails } from "../contracts/deadline.js";
import { requestDispatchCheck } from "../services/command-deadline.js";
import type { WallClock } from "../contracts/wall-clock.js";
import type { PluginPackage, PluginSource } from "../ports/plugin-source.js";
import type { InstalledPlugin, PluginStore, StoredPlugin } from "../ports/plugin-store.js";

// What install output and help say about every installed plugin.
export const PLUGIN_TRUST_NOTICE =
  "Plugins run inside wallet-cli with the wallet's privileges: nothing isolates them, and packages are neither signed nor reviewed. Install plugins only from sources you trust.";

export type PluginInstallSource =
  | { readonly type: "registry"; readonly spec: string }
  | { readonly type: "directory"; readonly path: string }
  | { readonly type: "archive"; readonly path: string };

// A plugin that ships with wallet-cli.
export interface BuiltinPluginInfo {
  readonly name: string;
  readonly version: string;
  readonly apiVersion: number;
  readonly apiRevision: number;
  readonly groups: readonly string[];
  // Why the plugin could not be registered in this process; absent when it was.
  readonly failure?: string;
}

export type PluginLoadState =
  { readonly state: "ok" } | { readonly state: "incompatible" | "broken"; readonly reason: string };

export interface PluginEnvironment {
  readonly builtins: readonly BuiltinPluginInfo[];
  // Top-level words of core commands, family names and other words the core keeps.
  readonly reservedWords: ReadonlySet<string>;
  // Whether each installed plugin could be loaded in this process.
  loadState(name: string): PluginLoadState | undefined;
}

export interface PluginListEntry {
  readonly name: string;
  readonly version?: string;
  readonly apiVersion?: number;
  readonly apiRevision?: number;
  readonly groups: readonly string[];
  readonly kind: "builtin" | "installed";
  readonly state: "ok" | "incompatible" | "broken";
  readonly reason?: string;
  readonly source?: PluginSourceRecord;
  readonly integrity?: string;
  readonly installedAt?: string;
}

export interface PluginInstallResult {
  readonly name: string;
  readonly version: string;
  readonly apiVersion: number;
  readonly apiRevision: number;
  readonly groups: readonly string[];
  readonly source: PluginSourceRecord;
  readonly integrity?: string;
  readonly installedAt: string;
  readonly notice: string;
}

export type PluginUpdateResult =
  | {
      readonly name: string;
      readonly status: "updated";
      readonly from: string;
      readonly to: string;
      // The update is installed, but this part of it could not be completed.
      readonly incomplete?: string;
    }
  | { readonly name: string; readonly status: "unchanged"; readonly version: string }
  | {
      readonly name: string;
      readonly status: "failed";
      readonly code: string;
      readonly message: string;
    };

export interface PluginRemoveResult {
  readonly name: string;
  readonly version?: string;
  readonly removed: true;
}

interface ValidPackage {
  readonly manifest: PluginManifest;
  readonly entry: Uint8Array;
  readonly pkg: PluginPackage;
}

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export class PluginService {
  constructor(
    private readonly store: PluginStore,
    private readonly source: PluginSource,
    private readonly env: PluginEnvironment,
    private readonly clock: WallClock,
  ) {}

  list(): PluginListEntry[] {
    const builtins: PluginListEntry[] = this.env.builtins.map((b) => ({
      name: b.name,
      version: b.version,
      apiVersion: b.apiVersion,
      apiRevision: b.apiRevision,
      groups: b.groups,
      kind: "builtin",
      ...(b.failure === undefined
        ? { state: "ok" as const }
        : { state: "broken" as const, reason: b.failure }),
    }));
    const installed = this.store
      .list()
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
      .map((stored): PluginListEntry => {
        if (stored.state === "unreadable") {
          return {
            name: stored.name,
            groups: [],
            kind: "installed",
            state: "broken",
            reason: stored.reason,
          };
        }
        const p = stored.plugin;
        const load = this.env.loadState(p.name) ?? { state: "ok" as const };
        return {
          name: p.name,
          version: p.version,
          apiVersion: p.apiVersion,
          apiRevision: p.apiRevision,
          groups: p.groups.map((g) => g.name),
          kind: "installed",
          state: load.state,
          ...(load.state === "ok" ? {} : { reason: load.reason }),
          source: p.source,
          ...(p.integrity === undefined ? {} : { integrity: p.integrity }),
          installedAt: p.installedAt,
        };
      });
    return [...builtins, ...installed];
  }

  async install(
    request: PluginInstallSource,
    registry: string,
    deadline: ExecutionDeadline,
  ): Promise<PluginInstallResult> {
    const check = requestDispatchCheck(deadline);
    const valid = this.#validate(await this.#fetch(request, registry, check));
    const { manifest } = valid;
    const record = this.#record(valid);
    this.store.update(manifest.name, (installed) => {
      if (installed.some((s) => nameOf(s) === manifest.name)) {
        throw pluginConflict(
          `plugin ${manifest.name} is already installed; run plugin update ${manifest.name} to replace it`,
        );
      }
      assertGroupsFree(manifest, installed);
      return { change: { kind: "publish", plugin: record, entry: valid.entry }, result: undefined };
    });
    return {
      name: record.name,
      version: record.version,
      apiVersion: record.apiVersion,
      apiRevision: record.apiRevision,
      groups: record.groups.map((g) => g.name),
      source: record.source,
      ...(record.integrity === undefined ? {} : { integrity: record.integrity }),
      installedAt: record.installedAt,
      notice: PLUGIN_TRUST_NOTICE,
    };
  }

  // Every installed plugin when no name is given; one failure does not stop the others.
  async update(
    name: string | undefined,
    deadline: ExecutionDeadline,
  ): Promise<PluginUpdateResult[]> {
    const check = requestDispatchCheck(deadline);
    if (name !== undefined) {
      try {
        return [await this.#updateOne(this.#installed(name), check)];
      } catch (error) {
        throw error instanceof CommittedUpdate ? error.error : error;
      }
    }
    const results: PluginUpdateResult[] = [];
    let firstFailure: CliError | undefined;
    for (const stored of this.store.list().sort((a, b) => nameOf(a).localeCompare(nameOf(b)))) {
      try {
        if (stored.state === "unreadable") {
          throw new ExecutionError(
            "plugin_load_failed",
            `the active manifest of plugin ${stored.name} cannot be read: ${stored.reason}; remove and install it again`,
          );
        }
        results.push(await this.#updateOne(stored.plugin, check));
      } catch (error) {
        if (error instanceof CommittedUpdate) {
          firstFailure ??= error.error;
          results.push({ ...error.result, incomplete: error.error.message });
          continue;
        }
        const failure = classifyError(error);
        firstFailure ??= failure;
        results.push({
          name: nameOf(stored),
          status: "failed",
          code: failure.code,
          message: failure.message,
        });
      }
    }
    if (firstFailure) throw withErrorDetails(firstFailure, { results });
    return results;
  }

  remove(name: string): PluginRemoveResult {
    this.#refuseBuiltin(name);
    return this.store.update(name, (installed) => {
      const stored = installed.find((s) => nameOf(s) === name);
      if (stored === undefined) throw notInstalled(name);
      return {
        change: { kind: "remove" },
        result: {
          name,
          ...(stored.state === "installed" ? { version: stored.plugin.version } : {}),
          removed: true as const,
        },
      };
    });
  }

  #installed(name: string): InstalledPlugin {
    this.#refuseBuiltin(name);
    const stored = this.store.list().find((s) => nameOf(s) === name);
    if (stored === undefined) throw notInstalled(name);
    if (stored.state === "unreadable") {
      throw new ExecutionError(
        "plugin_load_failed",
        `the active manifest of plugin ${name} cannot be read: ${stored.reason}; remove and install it again`,
      );
    }
    return stored.plugin;
  }

  async #updateOne(current: InstalledPlugin, check: DispatchCheck): Promise<PluginUpdateResult> {
    const source = current.source;
    if (source.type === "registry" && isPinned(parseRegistrySpec(source.spec))) {
      return { name: current.name, status: "unchanged", version: current.version };
    }
    const request: PluginInstallSource =
      source.type === "registry" ? { type: "registry", spec: source.spec } : source;
    const registry = source.type === "registry" ? source.registry : "";
    const valid = this.#validate(await this.#fetch(request, registry, check));
    if (valid.manifest.name !== current.name) {
      throw pluginConflict(
        `the source of plugin ${current.name} now holds plugin ${valid.manifest.name}; remove ${current.name} and install the new package`,
      );
    }
    const record = this.#record(valid);
    const updated: UpdatedResult = {
      name: current.name,
      status: "updated",
      from: current.version,
      to: record.version,
    };
    try {
      return this.store.update<PluginUpdateResult>(current.name, (installed) => {
        const stored = installed.find((s) => nameOf(s) === current.name);
        if (stored === undefined) {
          throw pluginConflict(
            `plugin ${current.name} was removed while it was being updated; run plugin install to install it again`,
          );
        }
        // The fetch was based on `current`; a plugin replaced meanwhile is not overwritten.
        if (stored.state !== "installed" || !sameInstallation(stored.plugin, current)) {
          throw pluginConflict(
            `plugin ${current.name} changed while it was being updated; run plugin update ${current.name} again`,
          );
        }
        if (
          stored.plugin.version === record.version &&
          stored.plugin.entrySha256 === record.entrySha256
        ) {
          return {
            change: { kind: "none" },
            result: { name: current.name, status: "unchanged", version: current.version },
          };
        }
        assertGroupsFree(valid.manifest, installed);
        return { change: { kind: "publish", plugin: record, entry: valid.entry }, result: updated };
      });
    } catch (error) {
      const failure = classifyError(error);
      if (isCommitted(failure)) throw new CommittedUpdate(updated, failure);
      throw error;
    }
  }

  async #fetch(
    request: PluginInstallSource,
    registry: string,
    check: DispatchCheck,
  ): Promise<PluginPackage> {
    switch (request.type) {
      case "registry":
        return this.source.fromRegistry(registry, parseRegistrySpec(request.spec), check);
      case "directory":
        return this.source.fromDirectory(request.path);
      case "archive":
        return this.source.fromArchive(request.path);
    }
  }

  // Checks the package on its own, before the store is touched.
  #validate(pkg: PluginPackage): ValidPackage {
    const manifest = parsePluginManifest(pkg.packageJson);
    const compatibility = pluginCompatibility(manifest.apiVersion, manifest.apiRevision);
    if (!compatibility.compatible) throw incompatiblePlugin(manifest.name, compatibility);
    const reserved = (word: string) =>
      this.env.reservedWords.has(word) ||
      this.env.builtins.some((b) => b.name === word || b.groups.includes(word));
    if (this.env.builtins.some((b) => b.name === manifest.name)) {
      throw pluginConflict(`plugin name ${manifest.name} belongs to a built-in plugin`);
    }
    for (const group of manifest.groups) {
      if (reserved(group.name)) {
        throw pluginConflict(
          `command group "${group.name}" of plugin ${manifest.name} is reserved by wallet-cli`,
        );
      }
    }
    const entry = pkg.file(manifest.entry);
    if (entry === undefined) {
      throw new ExecutionError(
        "plugin_invalid",
        `invalid plugin package: entry file ${manifest.entry} is missing`,
      );
    }
    return { manifest, entry, pkg };
  }

  #record({ manifest, entry, pkg }: ValidPackage): Omit<InstalledPlugin, "entryPath"> {
    return {
      name: manifest.name,
      version: manifest.version,
      apiVersion: manifest.apiVersion,
      apiRevision: manifest.apiRevision,
      groups: manifest.groups,
      source: pkg.source,
      ...(pkg.integrity === undefined ? {} : { integrity: pkg.integrity }),
      entrySha256: digest(entry),
      installedAt: new Date(this.clock()).toISOString(),
    };
  }

  #refuseBuiltin(name: string): void {
    if (this.env.builtins.some((b) => b.name === name)) {
      throw pluginConflict(
        `plugin ${name} is built into wallet-cli and changes only with wallet-cli itself`,
      );
    }
  }
}

// An update that was published although a later step failed.
type UpdatedResult = Extract<PluginUpdateResult, { status: "updated" }>;

class CommittedUpdate {
  constructor(
    readonly result: UpdatedResult,
    readonly error: CliError,
  ) {}
}

// The store marks a failure after its commit point with `committed: true`.
function isCommitted(error: CliError): boolean {
  const details = error.details as { committed?: boolean } | undefined;
  return details?.committed === true;
}

function sameInstallation(a: InstalledPlugin, b: InstalledPlugin): boolean {
  return (
    a.version === b.version &&
    a.entrySha256 === b.entrySha256 &&
    JSON.stringify(a.source) === JSON.stringify(b.source)
  );
}

function nameOf(stored: StoredPlugin): string {
  return stored.state === "installed" ? stored.plugin.name : stored.name;
}

function notInstalled(name: string): UsageError {
  return new UsageError(
    "plugin_not_installed",
    `no installed plugin named ${name}; run plugin list to see the installed plugins`,
  );
}

// Another installed plugin's group may not be claimed; the plugin being replaced is left out.
function assertGroupsFree(manifest: PluginManifest, installed: readonly StoredPlugin[]): void {
  for (const stored of installed) {
    if (stored.state !== "installed" || stored.plugin.name === manifest.name) continue;
    const taken = stored.plugin.groups.find((g: PluginGroupManifest) =>
      manifest.groups.some((own) => own.name === g.name),
    );
    if (taken) {
      throw pluginConflict(
        `command group "${taken.name}" is already provided by the installed plugin ${stored.plugin.name}`,
      );
    }
  }
}
