import type { ChainFamily } from "../family/chain-family.js";

/** Canonical persisted recipient. nameKey is an integrity-checked lookup key. */
export interface ContactEntry {
  name: string;
  nameKey: string;
  address: string;
  note: string | null;
  family: ChainFamily;
}

/** Public contact projection; storage-only normalization fields never leak. */
/** A contact as the user sees it: a flat name → address entry. The chain is evident from the
 *  address itself, so `family` stays internal — it buckets the stored file and routes `--to`. */
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
