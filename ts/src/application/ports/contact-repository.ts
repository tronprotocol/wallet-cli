import type { ChainFamily, ContactEntry } from "../../domain/types/index.js";

export interface ContactRepository {
  // Refuses a name or address already held in any family.
  add(entry: ContactEntry): ContactEntry;
  list(family: ChainFamily): ContactEntry[];
  find(family: ChainFamily, nameKey: string): ContactEntry | undefined;
  // Names are unique across families.
  findAnywhere(nameKey: string): ContactEntry | undefined;
  remove(family: ChainFamily, nameKey: string): ContactEntry;
}
