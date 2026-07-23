import type { ChainFamily } from "../family/index.js";

/** Canonical persisted recipient. nameKey is an integrity-checked lookup key. */
export interface ContactEntry {
  name: string;
  nameKey: string;
  address: string;
  note: string | null;
  family: ChainFamily;
}

/** Public contact projection; storage-only normalization fields never leak. */
export interface ContactView {
  name: string;
  address: string;
  note: string | null;
  family: ChainFamily;
}

export interface ContactListView {
  contacts: ContactView[];
}

export interface ResolvedRecipient {
  address: string;
  contactName?: string;
}
