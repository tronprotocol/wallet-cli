import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import type { TransactionScope } from "../../../contracts/execution-scope.js";
import type { LiquidityPort, TokenFacts } from "../../../ports/sunswap/liquidity.js";
import type { MarketDataPort } from "../../../ports/sunswap/market-data.js";
import { ChainError, UsageError } from "../../../../domain/errors/index.js";
import { redactErrorMessage } from "../../../../domain/errors/redact.js";
import { hasSunSwapMarket } from "../../../services/capability/predicates.js";
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
import { FAMILIES } from "../../../../domain/family/index.js";

type WarnScope = Pick<TransactionScope, "warn">;

export interface PositionInfoQuery {
  readonly protocol: string;
  // Nonnegative decimal NFT id.
  readonly positionId: string;
}

export interface PositionTokenView {
  readonly address: string;
  readonly symbol: string;
  readonly name?: string;
  readonly decimals: number;
  // Principal in base units.
  readonly amount: string;
  // Unclaimed fees in base units; absent when unreadable.
  readonly rewardAmount?: string;
  // USD per whole token; absent when unavailable.
  readonly priceUsd?: string;
}

export interface PositionInfoView {
  readonly position: {
    readonly nftTokenId: string;
    readonly owner: string;
    // V3 pool address or V4 64-hex pool id.
    readonly poolAddress: string;
    readonly protocol: "V3" | "V4";
    readonly status: RangeStatus;
    readonly lpTokenName: string;
    readonly lpTokenSymbol: string;
    // Position liquidity, not a fungible LP token balance.
    readonly lpBalanceAmount: string;
    readonly lpBalanceUsd?: string;
    // Fraction of active pool liquidity.
    readonly poolShare?: string;
    // Decimal fraction, e.g. 0.003 = 0.3%; zero for dynamic fees.
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
      throw new ChainError(
        "pool_not_found",
        `position ${tokenId} names a V3 pool for ${position.token0} / ${position.token1} at fee ${position.fee}, and the factory has none`,
      );
    }

    const range = { tickLower: position.tickLower, tickUpper: position.tickUpper };
    const amounts = this.liquidity.v3AmountsForLiquidity(pool, range, position.liquidity);
    // Simulate collect as the owner to measure fees without moving them.
    const owed = await this.#owed(scope, tokenId, () =>
      this.liquidity.v3OwedFees(network, tokenId, position.owner, position.owner),
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
      extra: {},
    });
  }

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
        // Preserve the pool's parameters; omit 0x to match position-list encoding.
        parameters: pool.parameters.replace(/^0x/i, ""),
        // The zero hook address also denotes native TRX; omit it to avoid ambiguity.
        ...(hasHooks(pool.hooks) ? { hooksAddress: describeHooks(pool.hooks) } : {}),
        hasSubscriber: position.hasSubscriber,
      },
    });
  }

  // Publish aggregate USD values only when both token prices are known.
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
      return { address, decimals: FAMILIES.tron.nativeDecimals, symbol: "TRX", name: "TRON" };
    }
    const [facts, name] = await Promise.all([
      this.liquidity.tokenFacts(network, address),
      this.liquidity.tokenName(network, address),
    ]);
    return { ...facts, ...(name === undefined ? {} : { name }) };
  }

  // Price failures must not hide the on-chain position or become zero valuations.
  async #prices(
    scope: WarnScope,
    network: NetworkDescriptor,
    addresses: readonly string[],
  ): Promise<Map<string, string>> {
    const empty = new Map<string, string>();
    if (!hasSunSwapMarket(network)) {
      scope.warn({
        code: "sunswap_prices_unavailable",
        message: `network ${network.id} has no SunSwap price source, so this position is reported without any USD value`,
      });
      return empty;
    }
    try {
      const quotes = await this.market.prices(network, addresses);
      for (const quote of quotes) {
        // The API uses zero for tokens it has not indexed.
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

  // Missing fees remain unknown; zero means a successful read returned zero.
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
