/**
 * Symbol → contract address for the SunSwap commands.
 *
 * One implementation, used by the market queries and by the liquidity commands. Two copies of
 * this rule would diverge the first time either was edited, and the amount a deposit is scaled by
 * comes from whatever address this returns — so a resolver that disagreed with the one the price
 * came from would quote one token and deposit another.
 *
 * The order is the one phase A set: the TRX/WTRX builtins, then the OFFICIAL address book. The
 * USER layer is deliberately not consulted — it is keyed per account, and a command that read it
 * would answer differently depending on which account happened to be active, which is worse for a
 * script than an honest refusal. That is also why a refusal does not suggest `token add`: adding
 * a token would not make the symbol resolvable here.
 */
import type { NetworkDescriptor, NetworkId } from "../../domain/types/index.js";
import type { TokenRepository } from "../ports/token-repository.js";
import { UsageError } from "../../domain/errors/index.js";
import { TronAddress } from "../../domain/address/index.js";
import { builtinSunSwapToken } from "../../domain/sunswap/tokens.js";

const ADDRESS = new TronAddress();

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
  resolve(network: NetworkDescriptor, value: string): string {
    const trimmed = value.trim();
    return ADDRESS.validate(trimmed) ? trimmed : this.resolveSymbol(network, trimmed);
  }

  resolveSymbol(network: NetworkDescriptor, symbol: string): string {
    const builtin = builtinSunSwapToken(symbol, network.id);
    if (builtin) return builtin;
    const wanted = symbol.toUpperCase();
    const entry = this.tokens
      .official(network.id)
      .find((token) => token.symbol.toUpperCase() === wanted);
    if (entry) return entry.id;
    throw new UsageError(
      "unsupported_token",
      `unknown token symbol ${symbol} on ${this.label(network)}; pass its contract address with --address`,
    );
  }

  /** the first alias pointing at this network, else its canonical id. */
  label(network: NetworkDescriptor): string {
    return (
      Object.entries(this.aliases).find(([, target]) => target === network.id)?.[0] ?? network.id
    );
  }
}
