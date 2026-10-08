/**
 * Symbol → contract address for the SunSwap commands.
 *
 * One implementation, used by the market queries, by swap and by the liquidity commands. Two
 * copies of this rule would diverge the first time either was edited, and the amount a deposit is
 * scaled by comes from whatever address this returns — so a resolver that disagreed with the one
 * the price came from would quote one token and deposit another.
 *
 * The order is: the TRX/WTRX builtins, then the address book. Which layers of the book are read
 * depends on the caller. `swap` and the liquidity commands read the EFFECTIVE book — official
 * entries plus the user layer of the account the command uses — the same source `tx send --token`
 * resolves from. `price` and `pool-list --token` take no account, so they can only read the
 * official layer, and their refusals do not suggest `token add`: adding a token would not make
 * the symbol resolvable there.
 *
 * A symbol that matches more than one entry is refused, never resolved to one of them — not even
 * the official one. A user-added token calling itself `USDT` is how an impersonation reaches a
 * trade, and refusing is how the caller finds out their book holds one.
 */
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

/** Who is asking. It decides which layers of the book are read and how a miss is explained. */
export type TokenResolutionCaller = "swap" | "liquidity" | "pool-list" | "price";

export interface TokenLookup {
  readonly caller: TokenResolutionCaller;
  /**
   * The account whose user layer is read. Only `swap` and the liquidity callers pass one; absent
   * means the official layer only.
   */
  readonly account?: AccountRef;
}

export interface ResolvedToken {
  readonly address: string;
  /** true when the symbol matched an entry the user added, not an official one. */
  readonly fromTokenBook: boolean;
}

/** How each caller's refusal tells the reader to name the token instead. */
const NOT_FOUND_HINT: Readonly<Record<TokenResolutionCaller, string>> = {
  swap: "pass its contract address in its place, or add it with 'wallet-cli token add'",
  liquidity:
    "pass its contract address with --token0/--token1, or add it with 'wallet-cli token add'",
  "pool-list": "pass its contract address with --token",
  price: "pass its contract address with --address",
};

/** Callers that read the account's user layer. */
const READS_USER_LAYER: ReadonlySet<TokenResolutionCaller> = new Set(["swap", "liquidity"]);

export class SunSwapTokenResolver {
  /**
   * `aliases` is the resolved config's alias book, injected for one reason: a refusal names the
   * network the way the caller types it ("on tron"), not by canonical id. Same book and same
   * reasoning as the capability gate's message.
   */
  constructor(
    private readonly tokens: TokenRepository,
    private readonly aliases: Record<string, NetworkId> = {},
  ) {}

  /** A value that is already an address passes through; anything else is a symbol. */
  resolve(network: NetworkDescriptor, value: string, lookup: TokenLookup): string {
    return this.resolveToken(network, value, lookup).address;
  }

  /** As `resolve`, and says whether the answer came from the user's own book. */
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
    // TRC-20 only: a TRC-10 entry the user added is addressed by asset id, which no SunSwap
    // contract accepts, so it is not a candidate here.
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

  /**
   * A liquidity command's `token0`/`token1`, resolved once at its entry.
   *
   * The returned input names addresses, so the resolution further in is a pass-through and every
   * step of the command works on the token this one chose. `resolved` feeds `withTokenBook`.
   */
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

  /** the first alias pointing at this network, else its canonical id. */
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

/**
 * The account whose token book a command reads: `--account`, else the active one.
 *
 * Read from `activeAccount`, which resolves the reference without touching an address, so a
 * `--quote` reads the same book as the execution it previews and still asks for no address. With
 * no account at all, there is no user layer, and the official one is all that applies.
 */
export function tokenBookAccount(scope: AccountScope): AccountRef | undefined {
  try {
    return scope.activeAccount;
  } catch (error) {
    if (error instanceof WalletError && error.code === "missing_wallet_address") return undefined;
    throw error;
  }
}

/**
 * Publish which addresses came from the user's own token book, so the text receipt can say so.
 *
 * Added only when there is one, so a trade between official tokens carries no extra key.
 */
export function withTokenBook<T extends Record<string, unknown>>(
  view: T,
  resolved: readonly (ResolvedToken | undefined)[],
): T {
  const fromTokenBook = [
    ...new Set(resolved.filter((token) => token?.fromTokenBook).map((token) => token!.address)),
  ];
  return fromTokenBook.length === 0 ? view : { ...view, fromTokenBook };
}
