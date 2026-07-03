import type { AccountRef, EffectiveTokenEntry, TokenEntry } from "../../domain/types/index.js";

export interface TokenRepository {
  effective(networkId: string, account: AccountRef): EffectiveTokenEntry[];
  add(networkId: string, account: AccountRef, entry: TokenEntry): "added" | "refreshed";
  remove(
    networkId: string,
    account: AccountRef,
    kind: TokenEntry["kind"],
    id: string,
  ): TokenEntry;
}

