// Resolve builtins first; reject ambiguous book symbols to prevent token impersonation.
import type {
  AccountRef,
  EffectiveTokenEntry,
  NetworkDescriptor,
  NetworkId,
} from "../../domain/types/index.js";
import type { AccountScope } from "../contracts/execution-scope.js";
import type { TokenRepository } from "../ports/token-repository.js";
import { UsageError, WalletError } from "../../domain/errors/index.js";
import { TronAddress } from "../../domain/address/index.js";
import { builtinSunSwapToken } from "../../domain/sunswap/tokens.js";

const ADDRESS = new TronAddress();

export type TokenResolutionCaller = "swap" | "liquidity" | "pool-list" | "price";

export interface TokenLookup {
  readonly caller: TokenResolutionCaller;
  // User layer for swap/liquidity; absent means official entries only.
  readonly account?: AccountRef;
}

export interface ResolvedToken {
  readonly address: string;
  // True only for a symbol resolved from a user entry.
  readonly fromTokenBook: boolean;
}

const NOT_FOUND_HINT: Readonly<Record<TokenResolutionCaller, string>> = {
  swap: "pass its contract address in its place, or add it with 'wallet-cli token add'",
  liquidity:
    "pass its contract address with --token0/--token1, or add it with 'wallet-cli token add'",
  "pool-list": "pass its contract address with --token",
  price: "pass its contract address with --address",
};

const READS_USER_LAYER: ReadonlySet<TokenResolutionCaller> = new Set(["swap", "liquidity"]);

export class SunSwapTokenResolver {
  constructor(
    private readonly tokens: TokenRepository,
    private readonly aliases: Record<string, NetworkId> = {},
  ) {}

  resolve(network: NetworkDescriptor, value: string, lookup: TokenLookup): string {
    return this.resolveToken(network, value, lookup).address;
  }

  resolveToken(network: NetworkDescriptor, value: string, lookup: TokenLookup): ResolvedToken {
    const trimmed = value.trim();
    return ADDRESS.validate(trimmed)
      ? { address: trimmed, fromTokenBook: false }
      : this.resolveSymbol(network, trimmed, lookup);
  }

  resolveSymbol(network: NetworkDescriptor, symbol: string, lookup: TokenLookup): ResolvedToken {
    const builtin = builtinSunSwapToken(symbol, network.id);
    if (builtin) return { address: builtin, fromTokenBook: false };
    const wanted = symbol.toUpperCase();
    // SunSwap accepts TRC20 contract addresses, not TRC10 asset IDs.
    const matches = this.#book(network, lookup).filter(
      (token) => token.kind === "trc20" && token.symbol.toUpperCase() === wanted,
    );
    if (matches.length > 1) {
      const candidates = matches
        .map((token) =>
          token.source === "user" ? `${token.id} (from your token book)` : `${token.id} (official)`,
        )
        .join(", ");
      throw new UsageError(
        "ambiguous_token_symbol",
        `token symbol ${symbol} matches more than one token on ${this.label(network)}: ${candidates}; pass the contract address of the one you mean`,
      );
    }
    const entry = matches[0];
    if (entry) return { address: entry.id, fromTokenBook: entry.source === "user" };
    throw new UsageError(
      "unsupported_token",
      `unknown token symbol ${symbol} on ${this.label(network)}; ${NOT_FOUND_HINT[lookup.caller]}`,
    );
  }

  // Resolve once so every step uses the same token addresses.
  resolvePair<T extends { readonly token0?: string; readonly token1?: string }>(
    network: NetworkDescriptor,
    input: T,
    lookup: TokenLookup,
  ): { input: T; resolved: readonly (ResolvedToken | undefined)[] } {
    const token0 =
      input.token0 === undefined ? undefined : this.resolveToken(network, input.token0, lookup);
    const token1 =
      input.token1 === undefined ? undefined : this.resolveToken(network, input.token1, lookup);
    return {
      input: {
        ...input,
        ...(token0 === undefined ? {} : { token0: token0.address }),
        ...(token1 === undefined ? {} : { token1: token1.address }),
      },
      resolved: [token0, token1],
    };
  }

  label(network: NetworkDescriptor): string {
    return (
      Object.entries(this.aliases).find(([, target]) => target === network.id)?.[0] ?? network.id
    );
  }

  #book(network: NetworkDescriptor, lookup: TokenLookup): readonly EffectiveTokenEntry[] {
    if (READS_USER_LAYER.has(lookup.caller) && lookup.account !== undefined) {
      return this.tokens.effective(network.id, lookup.account);
    }
    return this.tokens.official(network.id).map((token) => ({ ...token, source: "official" }));
  }
}

// Resolve the account without requiring an address, including for quotes.
export function tokenBookAccount(scope: AccountScope): AccountRef | undefined {
  try {
    return scope.activeAccount;
  } catch (error) {
    if (error instanceof WalletError && error.code === "missing_wallet_address") return undefined;
    throw error;
  }
}

export function withTokenBook<T extends Record<string, unknown>>(
  view: T,
  resolved: readonly (ResolvedToken | undefined)[],
): T {
  const fromTokenBook = [
    ...new Set(resolved.filter((token) => token?.fromTokenBook).map((token) => token!.address)),
  ];
  return fromTokenBook.length === 0 ? view : { ...view, fromTokenBook };
}
