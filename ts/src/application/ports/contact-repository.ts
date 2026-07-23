import type { ChainFamily, ContactEntry } from "../../domain/types/index.js";

export interface ContactRepository {
  add(entry: ContactEntry): ContactEntry;
  list(family: ChainFamily): ContactEntry[];
  find(family: ChainFamily, nameKey: string): ContactEntry | undefined;
  remove(family: ChainFamily, nameKey: string): ContactEntry;
}
