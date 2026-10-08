/**
 * `sunswap position-info` — one position, read from the chain.
 *
 * WHY IT IS CHAIN-FIRST. The SunSwap market API has no by-id endpoint: none of its forty
 * endpoints fetches one position, and `/apiv2/positions/user`'s fuzzy `query` returns empty for an
 * id it is given. The position manager, on the other hand, returns a position DIRECTLY by NFT id.
 * So the position manager and the pool are the source here, and the market API is asked for one
 * thing only: USD prices.
 *
 * WHICH MAKES IT WORK BEYOND MAINNET. The market API is mainnet-only; the contracts are not: Nile
 * has them, and everything that comes off the chain is readable there. So the command is gated on
 * `sunswap.liquidity` — the contracts — rather than on the market API, and the USD fields are
 * simply ABSENT where there is no price source.
 *
 * WHAT IS NOT PUBLISHED, AND WHY NOTHING STANDS IN FOR IT. Two fields exist only in the positions
 * API and have no chain equivalent at all: `lastActiveAt` (the position's last change — the
 * manager stores no timestamp, and finding it would mean walking the NFT's whole event history)
 * and each token's `logo` (a CDN URL held by an indexer). Their keys are omitted rather than
 * carried as null: a null invites a caller to render "unknown" for something that was never asked,
 * and a fabricated value would be worse. `positionType` — the API's constant "Liquidity Asset" —
 * is the market API's own classification of a row, not a fact about the position, and is omitted
 * for the same reason.
 *
 * EVERY USD FIGURE IS A CLAIM. Prices come from the market API, and where it does not answer — Nile,
 * an unreachable service, a token it does not list — the USD keys are dropped. Never a zero, never a
 * guess: a position reported as worth $0.00 reads as worthless, and that is a measurement nobody
 * took.
 */
import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import type { TransactionScope } from "../../../contracts/execution-scope.js";
import type { LiquidityPort, TokenFacts } from "../../../ports/sunswap/liquidity.js";
import type { MarketDataPort } from "../../../ports/sunswap/market-data.js";
import { ChainError, UsageError } from "../../../../domain/errors/index.js";
import { redactErrorMessage } from "../../../../domain/errors/redact.js";
import { isTronNetwork } from "../../../../domain/types/network.js";
import { NATIVE_TRX_ADDRESS } from "../../../../domain/sunswap/tokens.js";
import { readPosition } from "./position-read.js";
import { describeHooks, hasHooks } from "../../../../domain/sunswap/v4-pool.js";
import {
  derivedAmounts,
  feeRate,
  isDynamicFee,
  poolShare,
  priceAtTick,
  rangeStatus,
  sumUsd,
  usdValue,
  type RangeStatus,
} from "../../../../domain/sunswap/position-info.js";

/**
 * All this use case needs of its caller: somewhere to put a non-fatal warning.
 *
 * Narrower than `TransactionScope` on purpose — this command takes no account, signs nothing and
 * sends nothing, and asking for a scope that can resolve an address would imply otherwise.
 */
type WarnScope = Pick<TransactionScope, "warn">;

export interface PositionInfoQuery {
  /** already narrowed to V3 or V4 by the command schema; restated here for a direct caller. */
  readonly protocol: string;
  /** the NFT id, a non-negative integer as a decimal string. */
  readonly positionId: string;
}

/** One side of the pair, minus the keys only an indexer holds. */
export interface PositionTokenView {
  readonly address: string;
  readonly symbol: string;
  /** omitted when the token contract has no `name()` — never a placeholder. */
  readonly name?: string;
  readonly decimals: number;
  /** the principal this side of the position currently holds, in BASE units. */
  readonly amount: string;
  /** unclaimed fees on this side, base units. Absent when the fee read could not answer. */
  readonly rewardAmount?: string;
  /** USD per whole token. Absent where there is no price source for this network. */
  readonly priceUsd?: string;
}

export interface PositionInfoView {
  readonly position: {
    readonly nftTokenId: string;
    readonly owner: string;
    /** V3: the pool contract. V4: the 64-hex pool id, because a V4 pool has no address. */
    readonly poolAddress: string;
    readonly protocol: "V3" | "V4";
    readonly status: RangeStatus;
    /** what the position-manager NFT calls itself; read from it, not from the market API. */
    readonly lpTokenName: string;
    readonly lpTokenSymbol: string;
    /** the position's liquidity — the same figure as `extra.positionLiquidity` on V3 and V4. */
    readonly lpBalanceAmount: string;
    readonly lpBalanceUsd?: string;
    /** share of the pool's ACTIVE liquidity, as a decimal fraction. See `poolShare`. */
    readonly poolShare?: string;
    /** the pool's fee as a decimal fraction: "0.003" is 0.3%. "0" on a dynamic-fee pool. */
    readonly poolFeeRate: string;
    readonly tokens: readonly PositionTokenView[];
    readonly extra: Readonly<Record<string, unknown>>;
  };
}

export class SunSwapPositionInfoService {
  constructor(
    private readonly liquidity: LiquidityPort,
    private readonly market: MarketDataPort,
  ) {}

  async positionInfo(
    scope: WarnScope,
    network: NetworkDescriptor,
    query: PositionInfoQuery,
  ): Promise<PositionInfoView> {
    const protocol = query.protocol.trim().toUpperCase();
    if (protocol !== "V3" && protocol !== "V4") {
      throw new UsageError(
        "invalid_value",
        "--protocol must be V3 or V4; a V2, V1, V1_5 or CURVE position is not an NFT and has no id to look up",
      );
    }
    if (!/^\d+$/.test(query.positionId.trim())) {
      throw new UsageError(
        "invalid_value",
        "--position-id must be a non-negative whole number: it is an NFT id, not an address",
      );
    }
    const tokenId = query.positionId.trim();
    return protocol === "V4"
      ? this.#v4(scope, network, tokenId)
      : this.#v3(scope, network, tokenId);
  }

  // ── V3 ──────────────────────────────────────────────────────────────────────

  async #v3(
    scope: WarnScope,
    network: NetworkDescriptor,
    tokenId: string,
  ): Promise<PositionInfoView> {
    const position = await readPosition("V3", tokenId, network, () =>
      this.liquidity.v3Position(network, tokenId),
    );
    const pool = await this.liquidity.v3PoolState(
      network,
      position.token0,
      position.token1,
      position.fee,
    );
    if (!pool.exists) {
      // The position exists and names a pool the factory does not have. Not `position_not_found`:
      // the id is real, and telling a caller their position does not exist would be false.
      throw new ChainError(
        "pool_not_found",
        `position ${tokenId} names a V3 pool for ${position.token0} / ${position.token1} at fee ${position.fee}, and the factory has none`,
      );
    }

    const range = { tickLower: position.tickLower, tickUpper: position.tickUpper };
    const amounts = this.liquidity.v3AmountsForLiquidity(pool, range, position.liquidity);
    // What the contract itself says is claimable, read as the owner: `collect` is a static call
    // here, so it measures rather than moves.
    const owed = await this.#owed(scope, tokenId, () =>
      this.liquidity.v3OwedFees(network, tokenId, position.owner),
    );
    const [facts, nft] = await Promise.all([
      this.#pair(network, position.token0, position.token1),
      this.liquidity.positionNftFacts(network, "V3"),
    ]);
    const status = rangeStatus(pool.currentTick, position.tickLower, position.tickUpper);

    return this.#view(scope, network, {
      nftTokenId: tokenId,
      owner: position.owner,
      poolAddress: pool.poolAddress,
      protocol: "V3",
      status,
      nft,
      liquidity: position.liquidity,
      poolLiquidity: pool.liquidity,
      fee: pool.fee,
      facts,
      amounts,
      owed,
      range,
      // V3's `extra` carries no V4 keys at all.
      extra: {},
    });
  }

  // ── V4 ──────────────────────────────────────────────────────────────────────

  async #v4(
    scope: WarnScope,
    network: NetworkDescriptor,
    tokenId: string,
  ): Promise<PositionInfoView> {
    const position = await readPosition("V4", tokenId, network, () =>
      this.liquidity.v4Position(network, tokenId),
    );
    const pool = await this.liquidity.v4PoolState(network, position.poolId);
    if (!pool.exists) {
      throw new ChainError(
        "pool_not_found",
        `position ${tokenId} is in V4 pool ${position.poolId}, which nothing has initialised`,
      );
    }

    const range = { tickLower: position.tickLower, tickUpper: position.tickUpper };
    const amounts = this.liquidity.v4AmountsForLiquidity(pool, range, position.liquidity);
    const owed = await this.#owed(scope, tokenId, async () =>
      this.liquidity.v4OwedFees(network, {
        tokenId,
        poolId: position.poolId,
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
      }),
    );
    const [facts, nft] = await Promise.all([
      this.#pair(network, pool.currency0, pool.currency1),
      this.liquidity.positionNftFacts(network, "V4"),
    ]);
    const status = rangeStatus(pool.currentTick, position.tickLower, position.tickUpper);
    const derived = derivedAmounts(amounts.amount0, amounts.amount1, pool.sqrtPriceX96);

    return this.#view(scope, network, {
      // A V4 pool has no contract address, so the 64-hex pool id is what names it.
      nftTokenId: tokenId,
      owner: position.owner,
      poolAddress: pool.poolId,
      protocol: "V4",
      status,
      nft,
      liquidity: position.liquidity,
      poolLiquidity: pool.liquidity,
      fee: pool.fee,
      facts,
      amounts,
      owed,
      range,
      extra: {
        ...(derived === undefined
          ? {}
          : {
              derivedToken0Amount: derived.derived0,
              derivedToken1Amount: derived.derived1,
            }),
        isDynamicFee: isDynamicFee(pool.fee),
        // The pool key's own word, never re-encoded from the tick spacing — that would be our
        // guess at a layout the pool has already stated. The `0x` the read carries is dropped so
        // the value is spelled the way `position-list` publishes it and the two are comparable.
        parameters: pool.parameters.replace(/^0x/i, ""),
        // Only for a pool that HAS one: the zero address means "no hook", and on TRON that string
        // is also native TRX's, so printing it would say the pool is hooked to TRX.
        ...(hasHooks(pool.hooks) ? { hooksAddress: describeHooks(pool.hooks) } : {}),
        // A fact about the position rather than a problem with it, and not a market API field —
        // it is published because the chain states it and a caller deciding whether to act on a
        // position needs to know a notifier is attached to it.
        hasSubscriber: position.hasSubscriber,
      },
    });
  }

  // ── shared ──────────────────────────────────────────────────────────────────

  /**
   * The published object, once both protocols have produced the same facts.
   *
   * Everything USD-shaped is decided here and in one place, so there is exactly one rule for when
   * a valuation may be published: both prices known, or no valuation at all.
   */
  async #view(
    scope: WarnScope,
    network: NetworkDescriptor,
    parts: {
      nftTokenId: string;
      owner: string;
      poolAddress: string;
      protocol: "V3" | "V4";
      status: RangeStatus;
      nft: { name: string; symbol: string };
      liquidity: string;
      poolLiquidity: string;
      fee: number;
      facts: readonly (TokenFacts & { name?: string })[];
      amounts: { amount0: string; amount1: string };
      owed: { amount0: string; amount1: string } | undefined;
      range: { tickLower: number; tickUpper: number };
      extra: Record<string, unknown>;
    },
  ): Promise<PositionInfoView> {
    const [token0, token1] = parts.facts;
    const prices = await this.#prices(scope, network, [token0!.address, token1!.address]);
    const amounts = [parts.amounts.amount0, parts.amounts.amount1];
    const rewards = parts.owed === undefined ? undefined : [parts.owed.amount0, parts.owed.amount1];

    const tokens = parts.facts.map((facts, index) => ({
      address: facts.address,
      symbol: facts.symbol,
      ...(facts.name === undefined ? {} : { name: facts.name }),
      decimals: facts.decimals,
      amount: amounts[index]!,
      ...(rewards === undefined ? {} : { rewardAmount: rewards[index]! }),
      ...(prices.get(facts.address) === undefined ? {} : { priceUsd: prices.get(facts.address)! }),
    }));

    const valued = (base: readonly string[]): (string | undefined)[] =>
      parts.facts.map((facts, index) => {
        const price = prices.get(facts.address);
        return price === undefined ? undefined : usdValue(base[index]!, facts.decimals, price);
      });
    const lpBalanceUsd = sumUsd(valued(amounts));
    const tokenRewardUsd = rewards === undefined ? undefined : sumUsd(valued(rewards));
    const share = poolShare(parts.liquidity, parts.poolLiquidity, parts.status);

    return {
      position: {
        nftTokenId: parts.nftTokenId,
        owner: parts.owner,
        poolAddress: parts.poolAddress,
        protocol: parts.protocol,
        status: parts.status,
        lpTokenName: parts.nft.name,
        lpTokenSymbol: parts.nft.symbol,
        lpBalanceAmount: parts.liquidity,
        ...(lpBalanceUsd === undefined ? {} : { lpBalanceUsd }),
        ...(share === undefined ? {} : { poolShare: share }),
        poolFeeRate: feeRate(parts.fee),
        tokens,
        extra: {
          tickLower: parts.range.tickLower,
          tickUpper: parts.range.tickUpper,
          minPrice: priceAtTick(parts.range.tickLower, token0!.decimals, token1!.decimals),
          maxPrice: priceAtTick(parts.range.tickUpper, token0!.decimals, token1!.decimals),
          positionLiquidity: parts.liquidity,
          ...(tokenRewardUsd === undefined ? {} : { tokenRewardUsd }),
          ...parts.extra,
        },
      },
    };
  }

  /**
   * Both sides of the pair, with the optional `name` each contract may or may not carry.
   *
   * Native TRX is answered without a call: V4 keys carry it unwrapped, and it has no contract to
   * ask.
   */
  async #pair(
    network: NetworkDescriptor,
    address0: string,
    address1: string,
  ): Promise<(TokenFacts & { name?: string })[]> {
    return Promise.all([address0, address1].map((address) => this.#facts(network, address)));
  }

  async #facts(
    network: NetworkDescriptor,
    address: string,
  ): Promise<TokenFacts & { name?: string }> {
    if (address === NATIVE_TRX_ADDRESS) {
      return { address, decimals: 6, symbol: "TRX", name: "TRON" };
    }
    const [facts, name] = await Promise.all([
      this.liquidity.tokenFacts(network, address),
      this.liquidity.tokenName(network, address),
    ]);
    return { ...facts, ...(name === undefined ? {} : { name }) };
  }

  /**
   * USD per whole token, for the networks that have a price source — and nothing for the rest.
   *
   * The market API is mainnet-only, but that does not make this command mainnet-only: no price
   * source means no USD keys, and everything the chain reports is still published. A price service
   * that fails is treated the same way, with a warning, because a read-only query must not be
   * refused over a figure that was decoration on top of the answer.
   */
  async #prices(
    scope: WarnScope,
    network: NetworkDescriptor,
    addresses: readonly string[],
  ): Promise<Map<string, string>> {
    const empty = new Map<string, string>();
    if (!isTronNetwork(network) || !network.sunswap?.marketApiBaseUrl) {
      scope.warn({
        code: "sunswap_prices_unavailable",
        message: `network ${network.id} has no SunSwap price source, so this position is reported without any USD value`,
      });
      return empty;
    }
    try {
      const quotes = await this.market.prices(network, addresses);
      for (const quote of quotes) {
        // "0" is what the service answers for an address it has never indexed — an unlisted
        // token, or one it does not know — so it is an ABSENCE, not a price of nothing.
        if (quote.priceUsd !== undefined && quote.priceUsd !== "" && Number(quote.priceUsd) > 0) {
          empty.set(quote.address, quote.priceUsd);
        }
      }
      return empty;
    } catch (error) {
      scope.warn({
        code: "sunswap_prices_unavailable",
        message: `the USD prices for this position could not be read, so it is reported without any USD value: ${redactErrorMessage(
          error instanceof Error ? error.message : String(error),
        )}`,
      });
      return empty;
    }
  }

  /**
   * The unclaimed fees, or nothing — and never a zero for a question nobody could put.
   *
   * The same third state the collect command keeps: zero means the contract answered zero, absent
   * means it did not answer. On a figure a caller uses to decide whether a collection is worth its
   * fee, the difference is the whole point.
   */
  async #owed(
    scope: WarnScope,
    tokenId: string,
    read: () => Promise<{ amount0: string; amount1: string } | undefined>,
  ): Promise<{ amount0: string; amount1: string } | undefined> {
    try {
      const owed = await read();
      if (owed === undefined) {
        scope.warn({
          code: "sunswap_owed_fees_undecodable",
          message: `the fees owed to position ${tokenId} came back in a shape this could not decode, so no unclaimed amount is reported rather than a zero`,
        });
      }
      return owed;
    } catch (error) {
      scope.warn({
        code: "sunswap_owed_fees_unavailable",
        message: `the fees owed to position ${tokenId} could not be read, so no unclaimed amount is reported rather than a zero: ${redactErrorMessage(
          error instanceof Error ? error.message : String(error),
        )}`,
      });
      return undefined;
    }
  }
}
