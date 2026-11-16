import type { DispatchCheck } from "../contracts/deadline.js";
import type { JsonValue } from "../../domain/types/index.js";
import type { PluginSourceRecord, RegistrySpec } from "../../domain/plugins/index.js";

// A plugin package as its source holds it, before its manifest is validated.
export interface PluginPackage {
  readonly packageJson: JsonValue;
  // A file by its path inside the package; undefined when the package has no such regular file.
  readonly file: (path: string) => Uint8Array | undefined;
  // The registry's SHA-512 integrity value the download matched; absent for local sources.
  readonly integrity?: string;
  readonly source: PluginSourceRecord;
}

export interface PluginSource {
  // Reads the package metadata, downloads the version, and checks its integrity before reading it.
  fromRegistry(registry: string, spec: RegistrySpec, check: DispatchCheck): Promise<PluginPackage>;
  fromDirectory(path: string): PluginPackage;
  fromArchive(path: string): PluginPackage;
}
