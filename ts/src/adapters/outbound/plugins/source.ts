import type { DispatchCheck } from "../../../application/contracts/deadline.js";
import type { PluginPackage, PluginSource } from "../../../application/ports/plugin-source.js";
import type { RegistrySpec } from "../../../domain/plugins/index.js";
import { readArchiveFile, readPackageDirectory } from "./package.js";
import { RegistryClient } from "./registry.js";

export class PackageSource implements PluginSource {
  constructor(private readonly registry: RegistryClient = new RegistryClient()) {}

  fromRegistry(registry: string, spec: RegistrySpec, check: DispatchCheck): Promise<PluginPackage> {
    return this.registry.fetch(registry, spec, check);
  }

  fromDirectory(path: string): PluginPackage {
    return readPackageDirectory(path);
  }

  fromArchive(path: string): PluginPackage {
    return readArchiveFile(path);
  }
}
