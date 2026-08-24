import type { ChainFamily, ContactEntry } from "../../domain/types/index.js";

export interface ContactRepository {
  add(entry: ContactEntry): ContactEntry;
  list(family: ChainFamily): ContactEntry[];
  find(family: ChainFamily, nameKey: string): ContactEntry | undefined;
  /** the entry with this name, whichever chain holds it — names are unique across the book. */
  findAnywhere(nameKey: string): ContactEntry | undefined;
  remove(family: ChainFamily, nameKey: string): ContactEntry;
}
