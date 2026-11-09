// id is a TRC20 base58 contract, ERC20 hex contract, or numeric TRC10 asset id.
export interface TokenEntry {
  kind: "trc20" | "trc10" | "erc20";
  id: string;
  symbol: string;
  decimals: number;
  name?: string;
}
export type EffectiveTokenEntry = TokenEntry & { source: "official" | "user" };
// User entries keyed by <networkId>|<accountRef>.
export interface TokensFile {
  version: number;
  entries: Record<string, TokenEntry[]>;
}
