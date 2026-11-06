import type { NetworkDescriptor } from "../../domain/types/index.js";

export interface NetworkRegistry {
  resolve(id: string | undefined): NetworkDescriptor;
  resolveDefault(): NetworkDescriptor;
  all(): NetworkDescriptor[];
  aliasOf(id: string): string | undefined;
}
