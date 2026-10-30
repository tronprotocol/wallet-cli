// An account's token book over the network's official tokens; the token book applies each change
// inside its lock.
import type { EffectiveTokenEntry, TokenEntry } from "../types/index.js";
import { UsageError } from "../errors/index.js";
import { canonicalTokenId, tokenEntry } from "./index.js";

type TokenKey = Pick<TokenEntry, "kind" | "id">;

const sameToken = (a: TokenKey, b: TokenKey): boolean => a.kind === b.kind && a.id === b.id;

// Official tokens first; a user entry for an official token is hidden.
export function effectiveTokens(
  official: readonly TokenEntry[],
  user: readonly TokenEntry[],
): EffectiveTokenEntry[] {
  return [
    ...official.map((t) => ({ ...t, source: "official" as const })),
    ...user
      .filter((u) => !official.some((o) => sameToken(o, u)))
      .map((t) => ({ ...t, source: "user" as const })),
  ];
}

// Adds the token, or refreshes the stored entry with the same id in place.
export function withUserToken(
  official: readonly TokenEntry[],
  user: readonly TokenEntry[],
  input: TokenEntry,
  networkId: string,
): { tokens: TokenEntry[]; action: "added" | "refreshed" } {
  const entry = tokenEntry(input);
  if (official.some((o) => sameToken(o, entry))) {
    throw new UsageError(
      "token_already_listed",
      `${entry.id} is already an official token on ${networkId}`,
    );
  }
  const at = user.findIndex((t) => sameToken(t, entry));
  if (at < 0) return { tokens: [...user, entry], action: "added" };
  return { tokens: user.map((t, i) => (i === at ? entry : t)), action: "refreshed" };
}

export function withoutUserToken(
  official: readonly TokenEntry[],
  user: readonly TokenEntry[],
  kind: TokenEntry["kind"],
  input: string,
): { tokens: TokenEntry[]; removed: TokenEntry } {
  const id = canonicalTokenId(kind, input);
  if (official.some((o) => sameToken(o, { kind, id }))) {
    throw new UsageError("token_is_official", `cannot remove an official token: ${id}`);
  }
  const at = user.findIndex((t) => sameToken(t, { kind, id }));
  if (at < 0) {
    throw new UsageError("token_not_in_book", `token not in this account's book: ${id}`);
  }
  return { tokens: user.filter((_t, i) => i !== at), removed: user[at]! };
}
