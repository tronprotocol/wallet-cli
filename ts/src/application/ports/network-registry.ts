import type { NetworkDescriptor } from "../../domain/types/index.js";

export interface NetworkRegistry {
  resolve(id: string | undefined): NetworkDescriptor;
  /** fallback when no network override is supplied. */
  resolveDefault(): NetworkDescriptor;
  all(): NetworkDescriptor[];
  /** the short name pointing at this id, if the alias book has one (ADR-0010). */
  aliasOf(id: string): string | undefined;
}
