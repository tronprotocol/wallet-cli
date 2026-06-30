/**
 * SharedTypes — token address-book (persisted in tokens.json).
 */

/** one TRC20/TRC10 token in the address book. id = contract (base58) | assetId (numeric). */
export interface TokenEntry {
  kind: "trc20" | "trc10" | "erc20";
  id: string;
  symbol: string;
  decimals: number;
  name?: string;
}
/** a book entry tagged with which layer it came from (official builtin vs user-added). */
export type EffectiveTokenEntry = TokenEntry & { source: "official" | "user" };
/** tokens.json — user layer only; keyed `"<networkId>|<accountRef>"`. */
export interface TokensFile {
  version: number;
  entries: Record<string, TokenEntry[]>;
}
