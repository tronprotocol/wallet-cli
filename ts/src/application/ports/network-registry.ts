import type { NetworkDescriptor } from "../../domain/types/index.js";

export interface NetworkRegistry {
  resolve(id: string | undefined): NetworkDescriptor;
  /** fallback when no network override is supplied. */
  resolveDefault(): NetworkDescriptor;
  all(): NetworkDescriptor[];
}
