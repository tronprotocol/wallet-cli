// A token's symbol is chosen by its contract's deployer, so several entries may share one; a
// symbol resolves only when exactly one entry carries it.
import { errorMessage, UsageError, type UserMessage } from "../errors/index.js";

export type TokenSymbolMatch<T> =
  | { readonly kind: "one"; readonly token: T }
  | { readonly kind: "none" }
  | { readonly kind: "ambiguous"; readonly matches: readonly T[] };

export function matchTokenSymbol<T extends { readonly symbol: string }>(
  tokens: readonly T[],
  symbol: string,
): TokenSymbolMatch<T> {
  const wanted = symbol.toLowerCase();
  const matches = tokens.filter((token) => token.symbol.toLowerCase() === wanted);
  if (matches.length === 0) return { kind: "none" };
  if (matches.length > 1) return { kind: "ambiguous", matches };
  return { kind: "one", token: matches[0]! };
}

// The token-book lookup of a symbol: `token_not_in_book` or `ambiguous_token_symbol` otherwise.
// `instead` tells the user how to pick one token when the symbol is ambiguous.
export function tokenBySymbol<T extends { readonly symbol: string; readonly id: string }>(
  tokens: readonly T[],
  symbol: string,
  networkId: string,
  instead: UserMessage,
): T {
  const match = matchTokenSymbol(tokens, symbol);
  if (match.kind === "one") return match.token;
  if (match.kind === "none") {
    throw new UsageError(
      "token_not_in_book",
      `token symbol not in address book on ${networkId}: ${symbol}`,
    );
  }
  throw new UsageError(
    "ambiguous_token_symbol",
    errorMessage`token symbol ${symbol} matches more than one token on ${networkId}: ${match.matches.map((token) => token.id).join(", ")}; ${instead}`,
  );
}
