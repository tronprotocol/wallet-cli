import type { ChainFamily } from "../family/chain-family.js";

// nameKey is the normalized lookup key.
export interface ContactEntry {
  name: string;
  nameKey: string;
  address: string;
  note: string | null;
  family: ChainFamily;
}

export interface ContactView {
  name: string;
  address: string;
  note: string | null;
}

export interface ContactListView {
  contacts: ContactView[];
}

export interface ResolvedRecipient {
  address: string;
  contactName?: string;
}
