import type { AccountRef, EffectiveTokenEntry, TokenEntry } from "../../domain/types/index.js";

export interface TokenRepository {
  /**
   * The curated layer that ships with the binary, readable without an account.
   *
   * `effective` needs one because the USER layer is keyed per (network, account). A command
   * that takes no account can therefore only ever see this layer, and asking for it explicitly
   * is more honest than inventing an account to read the union with.
   */
  official(networkId: string): TokenEntry[];
  effective(networkId: string, account: AccountRef): EffectiveTokenEntry[];
  add(networkId: string, account: AccountRef, entry: TokenEntry): "added" | "refreshed";
  remove(networkId: string, account: AccountRef, kind: TokenEntry["kind"], id: string): TokenEntry;
}
