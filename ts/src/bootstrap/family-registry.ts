import type { ChainFamily } from "../domain/family/index.js";
import { tronFamily } from "./families/tron.js";
import type { AnyFamilyPlugin } from "./families/types.js";

/** Enabled family plugins. Adding a family requires one plugin and one entry here. */
export const FAMILY_REGISTRY: readonly AnyFamilyPlugin[] = [tronFamily];

export function familyMap<T>(pick: (plugin: AnyFamilyPlugin) => T): Record<ChainFamily, T> {
  return Object.fromEntries(
    FAMILY_REGISTRY.map((plugin) => [plugin.meta.family, pick(plugin)]),
  ) as Record<ChainFamily, T>;
}
