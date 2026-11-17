import type {
  PluginCredentialManifest,
  PluginGroupManifest,
  PluginSourceRecord,
} from "../../domain/plugins/index.js";

// The active manifest of one installed plugin, as the store last published it.
export interface InstalledPlugin {
  readonly name: string;
  readonly version: string;
  readonly apiVersion: number;
  readonly apiRevision: number;
  readonly groups: readonly PluginGroupManifest[];
  readonly credentials: readonly PluginCredentialManifest[];
  // Absolute path of the entry file this manifest points to.
  readonly entryPath: string;
  readonly source: PluginSourceRecord;
  readonly integrity?: string;
  // Hex SHA-256 of the entry file; an update with the same version and digest changes nothing.
  readonly entrySha256: string;
  // ISO 8601.
  readonly installedAt: string;
}

// A store directory with an active manifest that cannot be read is listed with the reason.
export type StoredPlugin =
  | { readonly state: "installed"; readonly plugin: InstalledPlugin }
  | { readonly state: "unreadable"; readonly name: string; readonly reason: string };

export interface PluginPublication {
  readonly kind: "publish";
  readonly plugin: Omit<InstalledPlugin, "entryPath">;
  readonly entry: Uint8Array;
}

export type PluginStoreChange =
  PluginPublication | { readonly kind: "remove" } | { readonly kind: "none" };

export interface PluginStore {
  // Every directory with an active manifest; a directory without one is not installed.
  list(): StoredPlugin[];
  // Under the store lock: `decide` sees the installed set as it is now and throws to refuse. A
  // publication writes a new version directory and then replaces the active manifest, which is the
  // commit point; a removal deletes the active manifest.
  update<R>(
    name: string,
    decide: (installed: readonly StoredPlugin[]) => { change: PluginStoreChange; result: R },
  ): R;
}
