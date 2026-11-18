// The contract between the core and a plugin. Every export is part of the plugin API (rule 9.7).
import type { ChainFamily } from "../domain/types/index.js";
import type { ErrorCodeEntry } from "../domain/errors/codes.js";
import type { CapabilityPredicate } from "../application/services/capability/predicates.js";
import type { HostServices } from "./host-services.js";
import type { PluginChainSpec, PluginCommand, PluginFamilyBinding } from "./command.js";

// Removing or changing an export raises the version; adding one raises the revision.
export { PLUGIN_API_REVISION, PLUGIN_API_VERSION } from "../domain/plugins/index.js";

export interface PluginGroup {
  // Top-level command word.
  readonly name: string;
  // One line in the root help.
  readonly summary: string;
  // Group help text.
  readonly description?: string;
  // Empty when the group is not bound to a family.
  readonly families: readonly ChainFamily[];
}

export interface PluginCredential {
  // Top-level config.yaml key; one word of letters and digits that starts with a lower-case letter.
  readonly key: string;
  // One line in the help of the config command.
  readonly summary: string;
}

export interface PluginHost {
  readonly services: HostServices;
  command(definition: PluginCommand): void;
  chainCommand(spec: PluginChainSpec, family: ChainFamily, binding: PluginFamilyBinding): void;
  errorCodes(codes: Readonly<Record<string, ErrorCodeEntry>>): void;
  // Keys start with the plugin's name or one of its group names, followed by a dot.
  capabilities(predicates: Readonly<Record<string, CapabilityPredicate>>): void;
}

export interface PluginDefinition {
  // Lower-case [a-z0-9-].
  readonly name: string;
  readonly version: string;
  readonly apiVersion: number;
  readonly apiRevision: number;
  readonly groups: readonly PluginGroup[];
  // The credential keys the plugin reads through `services.config.credential`.
  readonly credentials?: readonly PluginCredential[];
  // Synchronous; declares only, performs no I/O.
  register(host: PluginHost): void;
}
