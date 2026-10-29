import { initialPrice } from "../../../../domain/sunswap/initial-price.js";
import { resolveTronAccount } from "../../../services/tron-account.js";
import type { NetworkDescriptor, TxOutcome } from "../../../../domain/types/index.js";
import type { TransactionScope } from "../../../contracts/execution-scope.js";
import type { TransactionModeInput } from "../../../contracts/transaction-input.js";
import type {
  ContractCallPayload,
  LiquidityContractAddresses,
  LiquidityPort,
  TokenFacts,
  V2PairState,
  V3PoolState,
  V3Position,
  V4DepositRequest,
  V4IncreaseRequest,
  V4PoolState,
  V4Position,
} from "../../../ports/sunswap/liquidity.js";
import type { Permit2Port } from "../../../ports/sunswap/permit2.js";
import type { SignerResolver } from "../../../services/signer/index.js";
import { obtainSignature } from "../../../services/signing/obtain-signature.js";
import type { TypedDataPayload } from "../../../../domain/types/index.js";
import { describeHooks, resolveV4Pool } from "../../../../domain/sunswap/v4-pool.js";
import {
  parseLiquidityProtocol,
  type LiquidityProtocol,
} from "../../../../domain/sunswap/protocol.js";
import {
  assertPermitAuthorizes,
  assertSignedBy,
} from "../../../../domain/sunswap/permit2-guard.js";
import { recoverTronSigner } from "../../../../domain/sunswap/permit2-recover.js";
import { slippageToBips } from "../../../../domain/sunpump/curve.js";
import type { ChainGatewayProvider } from "../../../ports/chain/gateway-provider.js";
import type { TxPipeline } from "../../../services/pipeline/index.js";
import {
  outcomeData,
  transactionMode,
  transactionRequiresSigner,
} from "../../../services/transaction-mode.js";
import {
  LiquidityTransactions,
  outcomeTxId,
  withPositionManager,
  type ApprovalPlan,
} from "./liquidity-transactions.js";
import { warnOnPostCheck } from "../../../services/post-check.js";
import {
  tokenBookAccount,
  withTokenBook,
  type SunSwapTokenResolver,
} from "../../../services/sunswap-token-resolver.js";
import { ChainError, UsageError } from "../../../../domain/errors/index.js";
import { readPosition } from "./position-read.js";
import { toBaseUnits } from "../../../../domain/amounts/index.js";
import { NATIVE_TRX_ADDRESS } from "../../../../domain/sunswap/tokens.js";
import {
  applyMinimumShare,
  DEFAULT_V2_MIN_BASIS_POINTS,
  expectedLpAmount,
  pairAmount,
  resolveDeadline,
  selectAmounts,
} from "../../../../domain/sunswap/liquidity.js";
import {
  assertAligned,
  assertRange,
  DEFAULT_V3_FEE_TIER,
  defaultTickRange,
  MAX_TICK,
  MIN_TICK,
  tickSpacing,
} from "../../../../domain/sunswap/ticks.js";

const RESOLVED = { caller: "liquidity" } as const;

const KIND = "sunswap-add-liquidity" as const;

// V4 deposits grant unlimited TRC20 allowance; Permit2 grants remain amount-limited.
const V4_TRC20_ALLOWANCE = (2n ** 256n - 1n).toString();

const V4_PERMIT_TTL_SECONDS = 3600;

export interface AddLiquidityInput extends TransactionModeInput {
  readonly protocol: LiquidityProtocol;
  // Symbol or contract address.
  readonly token0?: string;
  readonly token1?: string;
  // Whole-token decimal amounts.
  readonly amount0?: string;
  readonly amount1?: string;
  readonly min0?: string;
  readonly min1?: string;
  readonly recipient?: string;
  // Unix seconds.
  readonly deadline?: number;
  // Energy fee cap in SUN.
  readonly feeLimit?: string;
  // V3/V4 NFT id to increase; absent for a new position.
  readonly positionId?: string;
  // V3 mint tier; V4 pool-key component or existing-position cross-check.
  readonly fee?: number;
  readonly tickLower?: number;
  readonly tickUpper?: number;
  readonly createPool?: boolean;
  // Initial square-root price in Q64.96.
  readonly sqrtPrice?: string;
  // Required for V4 mints: spacing identifies the pool and cannot be inferred from its fee.
  readonly tickSpacing?: number;
  // V4 hook contract or "none".
  readonly hooks?: string;
  // V4 decimal tolerance raising deposit ceilings; defaults to zero.
  readonly slippage?: string;
}

export type AddLiquidityV2Input = AddLiquidityInput & {
  readonly token0: string;
  readonly token1: string;
};

export interface LiquidityPlanView {
  readonly account: string;
  readonly protocol: "V2" | "V3" | "V4";
  // V2 router or V3/V4 manager; published as positionManager for V3/V4.
  readonly router: string;
  readonly recipient: string;
  readonly deadline: number;
  readonly token0: PlannedSide;
  readonly token1: PlannedSide;
  // Expected LP tokens in base units; absent when supply cannot determine it.
  readonly lpAmountExpected?: string;
  readonly lpDecimals?: number;
  readonly approvals?: readonly ApprovalPlan[];

  readonly nftTokenId?: string;
  readonly newPosition?: boolean;
  // Hundredths of a basis point: 3000 = 0.3%.
  readonly feeTier?: number;
  readonly tickLower?: number;
  readonly tickUpper?: number;
  // Unscaled liquidity; previews publish it as liquidityExpected.
  readonly liquidity?: string;
  readonly feeAuto?: boolean;
  readonly tickRangeAuto?: boolean;
  // Pool tick is at a representable price bound.
  readonly poolHasNoPrice?: boolean;

  // 32-byte V4 pool id.
  readonly poolId?: string;
  // V4 pool identity; independent of fee tier.
  readonly tickSpacing?: number;
  // Hook contract or "none"; the zero address also denotes native TRX.
  readonly hooks?: string;
  readonly poolCreated?: boolean;
  // Initial square-root price in Q64.96; pool creation only.
  readonly initialSqrtPriceX96?: string;
  // Deposit ceilings in base units; omitted at zero slippage tolerance.
  readonly amount0Max?: string;
  readonly amount1Max?: string;
  // Native call-value ceiling in SUN; present when it differs from the deposit.
  readonly nativeLocked?: string;
  readonly permits?: readonly {
    readonly token: string;
    readonly amount: string;
    readonly expiration: string;
  }[];
}

export interface PlannedSide {
  readonly address: string;
  readonly symbol: string;
  readonly decimals: number;
  // Base units to deposit.
  readonly amount: string;
  // Deposit floor in base units.
  readonly amountMinimum: string;
}

interface PlannedV4 {
  readonly plan: LiquidityPlanView;
  readonly pool: V4PoolState;
  readonly permitsNeeded: readonly { token: string; amount: string }[];
  readonly call:
    | { readonly kind: "mint"; readonly request: Omit<V4DepositRequest, "permits"> }
    | { readonly kind: "increase"; readonly request: Omit<V4IncreaseRequest, "permits"> };
  readonly liquidityBefore?: string;
}

interface V4Sizing {
  readonly facts0: TokenFacts;
  readonly facts1: TokenFacts;
  readonly plan: { readonly amount0: string; readonly amount1: string; readonly liquidity: string };
  // Ceiling tolerance in basis points.
  readonly bips: number;
  readonly amount0Max: string;
  readonly amount1Max: string;
  readonly permitsNeeded: readonly { token: string; amount: string; facts: TokenFacts }[];
  readonly approvals: readonly ApprovalPlan[];
  // Native call-value ceiling in SUN, when larger than the deposit.
  readonly nativeLocked?: string;
}

export class SunSwapLiquidityService {
  private readonly tx: LiquidityTransactions;

  constructor(
    private readonly liquidity: LiquidityPort,
    gateways: ChainGatewayProvider,
    pipeline: TxPipeline,
    private readonly tokens: SunSwapTokenResolver,
    private readonly permits: Permit2Port,
    private readonly signers: SignerResolver,
  ) {
    this.tx = new LiquidityTransactions(liquidity, gateways, pipeline);
  }

  async addLiquidity(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: AddLiquidityInput,
  ): Promise<Record<string, unknown>> {
    const book = this.tokens.resolvePair(network, input, {
      caller: "liquidity",
      account: tokenBookAccount(scope),
    });
    const resolved = book.input;
    // Non-CLI callers bypass the schema; an unknown protocol must not fall through to V2.
    const protocol = parseLiquidityProtocol(resolved.protocol);
    const result =
      protocol === "V4"
        ? await this.addLiquidityV4(scope, network, resolved)
        : protocol === "V3"
          ? await this.addLiquidityV3(scope, network, resolved)
          : await this.addLiquidityV2(scope, network, resolved as AddLiquidityV2Input);
    return withTokenBook(result, book.resolved);
  }

  async addLiquidityV4(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: AddLiquidityInput,
  ): Promise<Record<string, unknown>> {
    const mode = transactionMode(input);
    const owner = resolveTronAccount(scope);
    if (transactionRequiresSigner(input)) this.tx.assertCanSign(scope);

    const planned = await this.#planV4(network, owner, input);
    const { plan: internal, pool, call } = planned;
    let permitsNeeded = planned.permitsNeeded;
    if (mode.dryRun || mode.buildOnly) {
      const needed = [];
      for (const side of permitsNeeded) {
        const permit = await this.permits.planPermit(network, {
          owner,
          token: side.token,
          spender: this.#v4Manager(network),
          amount: side.amount,
          ttlSeconds: V4_PERMIT_TTL_SECONDS,
        });
        if (permit !== undefined) needed.push(side);
      }
      permitsNeeded = needed;
    }
    const plan = withoutV4Minimum(internal);
    const view = {
      ...plan,
      ...((mode.dryRun || mode.buildOnly) && plan.permits
        ? {
            permits: plan.permits.filter((row) =>
              permitsNeeded.some((side) => side.token === row.token),
            ),
          }
        : {}),
      ...(plan.approvals
        ? {
            approvals: plan.approvals.map((a) => ({
              ...a,
              amount: a.amount === V4_TRC20_ALLOWANCE ? "unlimited" : a.amount,
            })),
          }
        : {}),
      ...(plan.initialSqrtPriceX96 === undefined
        ? {}
        : {
            createPool: true,
            initialPrice: {
              token0: plan.token0.symbol,
              token1: plan.token1.symbol,
              token1PerToken0: initialPrice(
                plan.initialSqrtPriceX96,
                plan.token0.decimals,
                plan.token1.decimals,
              ),
            },
          }),
    };

    if (mode.buildOnly && permitsNeeded.length > 0) {
      // Building requires embedded permit signatures unless standing grants already suffice.
      throw new UsageError(
        "invalid_option",
        "--build-only is not available for this V4 deposit: it carries Permit2 grants inside the call, so it cannot be built before they are signed. --dry-run validates it, and a deposit whose Permit2 grants already cover the amounts has nothing to sign and does build",
      );
    }

    if (mode.dryRun) {
      // An unsigned grant prevents estimating the main call; approvals can still be priced.
      const priced =
        permitsNeeded.length === 0
          ? await this.tx.priceWithoutSending(
              scope,
              network,
              plan.approvals ?? [],
              this.#v4Payload(network, call, []),
              mode,
              input.feeLimit,
            )
          : await this.tx.priceApprovals(
              scope,
              network,
              plan.approvals ?? [],
              mode,
              input.feeLimit,
            );
      return { kind: KIND, mode: "dry-run", ...asPositionPreview(view), ...priced };
    }

    if (mode.buildOnly) {
      const built = await this.tx.buildOnly(
        scope,
        network,
        plan.approvals ?? [],
        this.#v4Payload(network, call, []),
        mode,
        input.feeLimit,
      );
      return { kind: KIND, ...asPositionPreview(view), ...built };
    }

    return this.tx.withApprovals(
      scope,
      network,
      plan.approvals ?? [],
      owner,
      mode,
      input.feeLimit,
      async (approvalTxIds) => {
        const permits = await this.#signV4Permits(scope, network, owner, pool, permitsNeeded);

        // Ownership can change during approval confirmation and signing.
        if (call.kind === "increase") {
          await this.#assertV4PositionOwned(network, call.request.tokenId, owner);
        } else if (
          call.request.initialSqrtPriceX96 !== undefined &&
          (await this.liquidity.v4PoolState(network, pool.poolId)).exists
        ) {
          // initializePool tolerates an existing pool; recheck to avoid using a stale creation price.
          throw new ChainError(
            "pool_already_exists",
            `V4 pool ${pool.poolId} was initialized while preparing this deposit; run again without --create-pool and --sqrt-price to size it at its current price`,
          );
        }

        const payload = this.#v4Payload(network, call, permits);
        const main = await this.tx.run(scope, network, payload, {
          mode,
          estimable: true,
          feeLimit: input.feeLimit,
        });
        const settled =
          call.kind === "increase"
            ? await this.#settleV4Increase(
                scope,
                network,
                call.request.tokenId,
                planned.liquidityBefore ?? "0",
                main,
              )
            : await this.#settleV4Mint(scope, network, main);
        const txId = outcomeTxId(main);
        if (main.stage === "confirmed" && txId !== undefined) {
          await warnOnPostCheck(scope, "sunswap_deposit_amounts", async () => {
            const actual = await this.liquidity.v4LiquidityResult(network, txId, {
              poolId: plan.poolId!,
              account: owner,
              ...(call.kind === "increase" ? { tokenId: call.request.tokenId } : {}),
              token0: plan.token0.address,
              token1: plan.token1.address,
              nativeValueSent: payload.callValueSun ?? "0",
            });
            if (!actual)
              return "the deposit confirmed but its actual amounts could not be read; amounts remain estimates";
            Object.assign(settled, {
              token0: { ...plan.token0, amount: (-BigInt(actual.balanceDelta0)).toString() },
              token1: { ...plan.token1, amount: (-BigInt(actual.balanceDelta1)).toString() },
              liquidity: actual.liquidityDelta,
              nftTokenId: actual.tokenId,
              amountsEstimated: false,
            });
            return undefined;
          });
        }
        return {
          kind: KIND,
          ...withPositionManager(view),
          ...(approvalTxIds.length === 0 ? {} : { approvalTxIds }),
          ...outcomeData(main),
          amountsEstimated: true,
          ...settled,
        };
      },
    );
  }

  async addLiquidityV2(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: AddLiquidityV2Input,
  ): Promise<Record<string, unknown>> {
    const owner = resolveTronAccount(scope);
    const { plan } = await this.#planV2(network, owner, input);
    const mode = transactionMode(input);

    // Watch-only dry runs and unsigned builds must not require a signer.
    if (transactionRequiresSigner(input)) {
      this.tx.assertCanSign(scope);
    }

    if (mode.dryRun) {
      const priced = await this.tx.priceWithoutSending(
        scope,
        network,
        plan.approvals ?? [],
        this.#depositPayload(network, plan),
        mode,
        input.feeLimit,
      );
      return { kind: KIND, mode: "dry-run", ...plan, ...priced };
    }
    if (mode.buildOnly) {
      const built = await this.tx.buildOnly(
        scope,
        network,
        plan.approvals ?? [],
        this.#depositPayload(network, plan),
        mode,
        input.feeLimit,
      );
      return { kind: KIND, ...plan, ...built };
    }

    const router = plan.router;
    return this.tx.withApprovals(
      scope,
      network,
      plan.approvals ?? [],
      owner,
      mode,
      input.feeLimit,
      async (approvalTxIds) => {
        const main = await this.tx.run(scope, network, this.#depositPayload(network, plan), {
          mode,
          estimable: true,
          feeLimit: input.feeLimit,
        });

        const settled = await this.#settle(scope, network, plan, main);

        return {
          kind: KIND,
          account: plan.account,
          protocol: plan.protocol,
          router,
          lpDecimals: plan.lpDecimals,
          recipient: plan.recipient,
          token0: publishedSide(plan.token0),
          token1: publishedSide(plan.token1),
          ...(approvalTxIds.length === 0 ? {} : { approvalTxIds }),
          ...outcomeData(main),
          amountsEstimated: true,
          ...settled,
        };
      },
    );
  }

  async #planV4(
    network: NetworkDescriptor,
    owner: string,
    input: AddLiquidityInput,
  ): Promise<PlannedV4> {
    return input.positionId === undefined
      ? this.#planV4Mint(network, owner, input)
      : this.#planV4Increase(network, owner, input, input.positionId);
  }

  // Pool creation uses the supplied price; an uninitialized pool's on-chain price is zero.
  async #planV4Mint(
    network: NetworkDescriptor,
    owner: string,
    input: AddLiquidityInput,
  ): Promise<PlannedV4> {
    const target = resolveV4Pool({
      createPool: input.createPool === true,
      ...(input.sqrtPrice === undefined ? {} : { sqrtPrice: input.sqrtPrice }),
      ...(input.token0 === undefined
        ? {}
        : { token0: this.tokens.resolve(network, input.token0, RESOLVED) }),
      ...(input.token1 === undefined
        ? {}
        : { token1: this.tokens.resolve(network, input.token1, RESOLVED) }),
      ...(input.fee === undefined ? {} : { fee: input.fee }),
      ...(input.tickSpacing === undefined ? {} : { tickSpacing: input.tickSpacing }),
      ...(input.hooks === undefined ? {} : { hooks: input.hooks }),
    });

    const poolId = this.liquidity.v4PoolIdOf(network, target);
    const pool =
      target.kind === "existing"
        ? await this.liquidity.v4PoolState(network, poolId)
        : this.#createdPool(target, poolId);
    // An existing pool must be sized at its current price, not the requested creation price.
    if (target.kind === "create" && (await this.liquidity.v4PoolState(network, poolId)).exists) {
      throw new ChainError(
        "pool_already_exists",
        `a V4 pool already exists with currency0 ${target.token0}, currency1 ${target.token1}, fee ${target.fee}, tick spacing ${target.tickSpacing} and hooks ${describeHooks(target.hooks)} (pool id ${poolId}). Deposit into it without --create-pool and --sqrt-price`,
      );
    }
    if (target.kind === "existing" && !pool.exists) {
      throw new ChainError(
        "pool_not_found",
        `no V4 pool exists with currency0 ${target.token0}, currency1 ${target.token1}, fee ${target.fee}, tick spacing ${target.tickSpacing} and hooks ${describeHooks(target.hooks)} — that key hashes to pool id ${poolId}, which nothing has initialised. Check --tick-spacing first: it is part of the pool's identity and is not implied by --fee, so a pool at this fee tier may well exist at a different spacing. 'sunswap pool-list --protocol V4' publishes each pool's tickSpacing and hooks; --create-pool with --sqrt-price makes this one`,
      );
    }

    const auto = input.tickLower === undefined && input.tickUpper === undefined;
    const range = auto
      ? defaultTickRange(pool.currentTick, pool.tickSpacing)
      : this.#v4Range(input, pool.tickSpacing);

    const sized = await this.#sizeV4(network, owner, input, pool, range);
    const recipient = input.recipient ?? owner;
    const deadline = resolveDeadline(input.deadline, Date.now());

    return {
      plan: {
        ...this.#v4PlanBase(network, owner, pool, range, sized, recipient, deadline),
        newPosition: true,
        ...(auto ? { tickRangeAuto: true } : {}),
        ...(target.kind === "create"
          ? { poolCreated: true, initialSqrtPriceX96: target.sqrtPriceX96 }
          : {}),
        ...this.#v4PermitRows(sized),
      },
      pool,
      permitsNeeded: sized.permitsNeeded.map((side) => ({
        token: side.token,
        amount: side.amount,
      })),
      call: {
        kind: "mint",
        request: {
          ...(target.kind === "create" ? { initialSqrtPriceX96: target.sqrtPriceX96 } : {}),
          pool: keyOf(pool),
          tickLower: range.tickLower,
          tickUpper: range.tickUpper,
          liquidity: sized.plan.liquidity,
          amount0Max: sized.amount0Max,
          amount1Max: sized.amount1Max,
          recipient,
          permitOwner: owner,
          // Refund unused native value to the depositor, even when the NFT recipient differs.
          sweepRecipient: owner,
          deadline,
        },
      },
    };
  }

  async #planV4Increase(
    network: NetworkDescriptor,
    owner: string,
    input: AddLiquidityInput,
    positionId: string,
  ): Promise<PlannedV4> {
    if (input.recipient !== undefined) {
      throw new UsageError(
        "invalid_option",
        "--recipient is not accepted with --position-id on V4; the position already has a holder",
      );
    }
    if (input.tickLower !== undefined || input.tickUpper !== undefined) {
      throw new UsageError(
        "invalid_option",
        "--tick-lower and --tick-upper are not accepted with --position-id; a position's range is fixed at birth",
      );
    }
    if (input.createPool === true) {
      throw new UsageError(
        "invalid_option",
        "--create-pool is not accepted with --position-id; the position names its own pool",
      );
    }
    if (input.token0 === undefined || input.token1 === undefined) {
      throw new UsageError(
        "missing_option",
        "V4 requires --token0 and --token1 as well as --position-id; the pair is checked against the pair the position holds",
      );
    }

    const position = await this.#assertV4PositionOwned(network, positionId, owner);
    this.#assertV4PairMatches(network, position, input.token0, input.token1);
    if (input.fee !== undefined && input.fee !== position.fee) {
      throw new UsageError(
        "invalid_value",
        `--fee ${input.fee} does not match position ${position.tokenId}, which is in a ${position.fee} tier pool`,
      );
    }

    const pool = await this.liquidity.v4PoolState(network, position.poolId);
    if (!pool.exists) {
      throw new ChainError(
        "pool_not_found",
        `no V4 pool with id ${position.poolId} has been initialised on this network`,
      );
    }

    const range = { tickLower: position.tickLower, tickUpper: position.tickUpper };
    const sized = await this.#sizeV4(network, owner, input, pool, range);
    const deadline = resolveDeadline(input.deadline, Date.now());

    return {
      plan: {
        // Increasing liquidity does not transfer the NFT.
        ...this.#v4PlanBase(network, owner, pool, range, sized, position.owner, deadline),
        nftTokenId: position.tokenId,
        newPosition: false,
        ...this.#v4PermitRows(sized),
      },
      pool,
      permitsNeeded: sized.permitsNeeded.map((side) => ({
        token: side.token,
        amount: side.amount,
      })),
      call: {
        kind: "increase",
        request: {
          pool: keyOf(pool),
          tokenId: position.tokenId,
          liquidity: sized.plan.liquidity,
          amount0Max: sized.amount0Max,
          amount1Max: sized.amount1Max,
          owner,
          sweepRecipient: owner,
          deadline,
        },
      },
      liquidityBefore: position.liquidity,
    };
  }

  async #sizeV4(
    network: NetworkDescriptor,
    owner: string,
    input: AddLiquidityInput,
    pool: V4PoolState,
    range: { tickLower: number; tickUpper: number },
  ): Promise<V4Sizing> {
    const [facts0, facts1] = await Promise.all([
      this.#v4Facts(network, pool.currency0),
      this.#v4Facts(network, pool.currency1),
    ]);

    const given = this.#humanAmounts(input, facts0, facts1);
    // Size from sqrtPriceX96; the tick is only the lower edge of its price band.
    const plan = this.liquidity.v4Amounts(pool, range, given);

    // Slippage widens the ceiling upward; narrowing it could reject the deposit.
    const bips = input.slippage === undefined ? 0 : slippageToBips(input.slippage);
    const amount0Max = raiseBy(plan.amount0, bips);
    const amount1Max = raiseBy(plan.amount1, bips);

    const permitsNeeded = [
      { token: pool.currency0, amount: amount0Max, facts: facts0 },
      { token: pool.currency1, amount: amount1Max, facts: facts1 },
      // Native TRX travels as call value and needs no allowance or permit.
    ].filter((side) => !isNative(side.token) && BigInt(side.amount) > 0n);
    // Check ceiling balances before spending on approvals or signing permits.
    await this.#assertBalances(network, owner, permitsNeeded);

    const permit2 = await this.liquidity.permit2Address(network);
    const approvals = await this.tx.planApprovals(
      network,
      owner,
      permit2,
      permitsNeeded.map((side) => ({
        facts: side.facts,
        amount: side.amount,
        approvalAmount: V4_TRC20_ALLOWANCE,
      })),
    );

    const nativeIn = isNative(pool.currency0) || isNative(pool.currency1);
    const nativeCeiling = isNative(pool.currency0) ? amount0Max : amount1Max;
    const nativeDeposit = isNative(pool.currency0) ? plan.amount0 : plan.amount1;
    if (nativeIn) {
      // The full native ceiling is sent as call value; unused value is refunded.
      await this.#assertNativeCovers(network, owner, nativeCeiling);
    }

    return {
      facts0,
      facts1,
      plan,
      bips,
      amount0Max,
      amount1Max,
      permitsNeeded,
      approvals,
      ...(nativeIn && nativeCeiling !== nativeDeposit ? { nativeLocked: nativeCeiling } : {}),
    };
  }

  #v4PlanBase(
    network: NetworkDescriptor,
    owner: string,
    pool: V4PoolState,
    range: { tickLower: number; tickUpper: number },
    sized: V4Sizing,
    recipient: string,
    deadline: number,
  ): LiquidityPlanView {
    return {
      account: owner,
      protocol: "V4",
      router: this.#v4Manager(network),
      recipient,
      deadline,
      token0: { ...sized.facts0, amount: sized.plan.amount0, amountMinimum: "0" },
      token1: { ...sized.facts1, amount: sized.plan.amount1, amountMinimum: "0" },
      poolId: pool.poolId,
      feeTier: pool.fee,
      tickSpacing: pool.tickSpacing,
      hooks: describeHooks(pool.hooks),
      tickLower: range.tickLower,
      tickUpper: range.tickUpper,
      liquidity: sized.plan.liquidity,
      ...(sized.approvals.length === 0 ? {} : { approvals: sized.approvals }),
      ...(sized.bips === 0 ? {} : { amount0Max: sized.amount0Max, amount1Max: sized.amount1Max }),
      ...(sized.nativeLocked === undefined ? {} : { nativeLocked: sized.nativeLocked }),
    };
  }

  // Preview grant expiry is independent of the transaction deadline.
  #v4PermitRows(sized: V4Sizing): Partial<LiquidityPlanView> {
    if (sized.permitsNeeded.length === 0) return {};
    const expiration = String(Math.floor(Date.now() / 1000) + V4_PERMIT_TTL_SECONDS);
    return {
      permits: sized.permitsNeeded.map((side) => ({
        token: side.token,
        amount: side.amount,
        expiration,
      })),
    };
  }

  #v4Payload(
    network: NetworkDescriptor,
    call: PlannedV4["call"],
    permits: readonly { grant: unknown; signature: string }[],
  ): ContractCallPayload {
    return call.kind === "increase"
      ? this.liquidity.v4IncreasePayload(network, { ...call.request, permits })
      : this.liquidity.v4DepositPayload(network, { ...call.request, permits });
  }

  // Require currency order so amount0/amount1 fund the intended assets.
  #assertV4PairMatches(
    network: NetworkDescriptor,
    position: V4Position,
    token0: string,
    token1: string,
  ): void {
    const given = [
      this.tokens.resolve(network, token0, RESOLVED),
      this.tokens.resolve(network, token1, RESOLVED),
    ];
    const held = [position.currency0, position.currency1];
    const matches = given[0] === held[0] && given[1] === held[1];
    if (!matches) {
      throw new UsageError(
        "invalid_value",
        `--token0 ${given[0]} and --token1 ${given[1]} do not match position ${position.tokenId}'s currency order; use --token0 ${held[0]} --token1 ${held[1]} and set --amount0 / --amount1 for the corresponding assets`,
      );
    }
  }

  async #assertV4PositionOwned(
    network: NetworkDescriptor,
    tokenId: string,
    owner: string,
  ): Promise<V4Position> {
    const position = await readPosition("V4", tokenId, network, () =>
      this.liquidity.v4Position(network, tokenId),
    );
    if (position.owner !== owner) {
      throw new UsageError(
        "invalid_value",
        `position ${tokenId} is held by ${position.owner}, not by this account`,
      );
    }
    return position;
  }

  #createdPool(
    target: Extract<ReturnType<typeof resolveV4Pool>, { kind: "create" }>,
    poolId: string,
  ): V4PoolState {
    return {
      poolId,
      exists: false,
      sqrtPriceX96: target.sqrtPriceX96,
      currentTick: this.liquidity.tickAtSqrtPrice(target.sqrtPriceX96),
      liquidity: "0",
      currency0: target.token0,
      currency1: target.token1,
      fee: target.fee,
      tickSpacing: target.tickSpacing,
      hooks: target.hooks,
      parameters: this.liquidity.v4ParametersFor(target.tickSpacing),
    };
  }

  #v4Range(input: AddLiquidityInput, spacing: number): { tickLower: number; tickUpper: number } {
    for (const [flag, tick] of [
      ["--tick-lower", input.tickLower],
      ["--tick-upper", input.tickUpper],
    ] as const) {
      if (tick === undefined) {
        throw new UsageError(
          "missing_option",
          `${flag} is required when the other is given: half a range is not a range`,
        );
      }
      assertAligned(tick, spacing, flag);
    }
    assertRange(input.tickLower!, input.tickUpper!);
    return { tickLower: input.tickLower!, tickUpper: input.tickUpper! };
  }

  async #v4Facts(network: NetworkDescriptor, address: string): Promise<TokenFacts> {
    if (address === NATIVE_TRX_ADDRESS) return { address, symbol: "TRX", decimals: 6 };
    return this.#facts(network, address);
  }

  // Validate permit terms before signing and recover the owner afterward.
  async #signV4Permits(
    scope: TransactionScope,
    network: NetworkDescriptor,
    owner: string,
    pool: V4PoolState,
    needed: readonly { token: string; amount: string }[],
  ): Promise<{ grant: unknown; signature: string }[]> {
    if (needed.length === 0) return [];
    const spender = this.#v4Manager(network);
    const signer = this.signers.resolve(scope.activeAccount, "tron");
    const signed: { grant: unknown; signature: string }[] = [];
    for (const side of needed) {
      const permit = await this.permits.planPermit(network, {
        owner,
        token: side.token,
        spender,
        amount: side.amount,
        ttlSeconds: V4_PERMIT_TTL_SECONDS,
      });
      if (permit === undefined) continue;
      const now = Math.floor(Date.now() / 1000);
      assertPermitAuthorizes(permit.typedData, {
        token: side.token,
        spender,
        permit2: permit.permit2,
        chainId: v4ChainId(network),
        amount: side.amount,
        notAfter: now + V4_PERMIT_TTL_SECONDS,
        now,
      });
      const result = await obtainSignature(signer, scope, (opts) =>
        signer.signTypedData(permit.typedData as TypedDataPayload, opts),
      );
      assertSignedBy(
        recoverTronSigner(result.digest, result.signature),
        owner,
        result.primaryType ?? "",
      );
      signed.push({ grant: permit.grant, signature: result.signature });
    }
    void pool;
    return signed;
  }

  #v4Manager(network: NetworkDescriptor): string {
    return this.liquidity.v4PositionManager(network);
  }

  // A failed post-read must not fail a confirmed deposit.
  async #settleV4Increase(
    scope: TransactionScope,
    network: NetworkDescriptor,
    tokenId: string,
    liquidityBefore: string,
    outcome: TxOutcome,
  ): Promise<Record<string, unknown>> {
    if (outcome.stage !== "confirmed") return {};
    let settled: Record<string, unknown> = {};
    await warnOnPostCheck(scope, "sunswap_position_liquidity", async () => {
      const after = await this.liquidity.v4Position(network, tokenId);
      settled = {
        liquidity: (BigInt(after.liquidity) - BigInt(liquidityBefore)).toString(),
        liquidityAfter: after.liquidity,
      };
      return undefined;
    });
    return settled;
  }

  // Require the native ceiling; energy can come from resources, so do not add a fee estimate.
  async #assertNativeCovers(
    network: NetworkDescriptor,
    owner: string,
    ceiling: string,
  ): Promise<void> {
    const held = await this.liquidity.nativeBalance(network, owner);
    if (BigInt(held) < BigInt(ceiling)) {
      throw new ChainError(
        "insufficient_balance",
        `this deposit locks ${ceiling} SUN as the call's value — the ceiling, not the amount the pool takes, which is returned if unused — and the account holds ${held}`,
      );
    }
  }

  async #settle(
    scope: TransactionScope,
    network: NetworkDescriptor,
    plan: LiquidityPlanView,
    outcome: TxOutcome,
  ): Promise<Record<string, unknown>> {
    if (outcome.stage !== "confirmed") return {};
    const txId = outcomeTxId(outcome);
    if (!txId) return {};
    const settled: Record<string, unknown> = {};
    await warnOnPostCheck(scope, "sunswap_liquidity_postread", async () => {
      const actual = await this.liquidity.v2LiquidityResult(
        network,
        txId,
        "add",
        isNative(plan.token0.address),
      );
      if (!actual) return "the router result could not be read; amounts remain estimates";
      Object.assign(settled, {
        token0: { ...publishedSide(plan.token0), amount: actual.amount0 },
        token1: { ...publishedSide(plan.token1), amount: actual.amount1 },
        lpAmount: actual.lpAmount,
        amountsEstimated: false,
      });
      return undefined;
    });
    await warnOnPostCheck(scope, "sunswap_liquidity_reserves", async () => {
      const after = await this.liquidity.v2PairState(
        network,
        poolSideOf(this.liquidity.contracts(network), plan.token0.address),
        poolSideOf(this.liquidity.contracts(network), plan.token1.address),
      );
      Object.assign(settled, {
        lpDecimals: after.lpDecimals,
        reservesAfter: { token0: after.reserve0, token1: after.reserve1 },
        pool: after.pairAddress,
      });
      return undefined;
    });
    return settled;
  }

  async addLiquidityV3(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: AddLiquidityInput,
  ): Promise<Record<string, unknown>> {
    const owner = resolveTronAccount(scope);
    const { plan, liquidityBefore, poolOrder } = await this.#planV3(network, owner, input);
    // Payloads retain input order; position views use pool order for later amount0/amount1 inputs.
    const view = poolOrder ? plan : { ...plan, token0: plan.token1, token1: plan.token0 };
    const mode = transactionMode(input);

    if (transactionRequiresSigner(input)) {
      this.tx.assertCanSign(scope);
    }
    if (mode.dryRun) {
      const priced = await this.tx.priceWithoutSending(
        scope,
        network,
        plan.approvals ?? [],
        this.#depositPayload(network, plan),
        mode,
        input.feeLimit,
      );
      return { kind: KIND, mode: "dry-run", ...asPositionPreview(view), ...priced };
    }
    if (mode.buildOnly) {
      const built = await this.tx.buildOnly(
        scope,
        network,
        plan.approvals ?? [],
        this.#depositPayload(network, plan),
        mode,
        input.feeLimit,
      );
      return { kind: KIND, ...asPositionPreview(view), ...built };
    }

    return this.tx.withApprovals(
      scope,
      network,
      plan.approvals ?? [],
      owner,
      mode,
      input.feeLimit,
      async (approvalTxIds) => {
        // Ownership can change while approvals confirm.
        if (plan.nftTokenId !== undefined && !plan.newPosition) {
          await this.#assertPositionOwned(network, plan.nftTokenId, owner);
        }

        const main = await this.tx.run(scope, network, this.#depositPayload(network, plan), {
          mode,
          estimable: true,
          feeLimit: input.feeLimit,
        });

        // The new NFT id is assigned during execution and must be read from the receipt.
        const minted = await this.#mintedPositionId(scope, network, plan, main);
        const settled = await this.#settleV3(
          scope,
          network,
          plan.nftTokenId ?? minted,
          liquidityBefore,
          main,
        );

        const txId = outcomeTxId(main);
        if (main.stage === "confirmed" && txId !== undefined) {
          await warnOnPostCheck(scope, "sunswap_deposit_amounts", async () => {
            const actual = await this.liquidity.v3DepositedAmounts(
              network,
              txId,
              plan.nftTokenId ?? minted,
            );
            if (!actual)
              return "the deposit confirmed but its IncreaseLiquidity event could not be read; amounts remain estimates";
            Object.assign(settled, {
              token0: {
                ...publishedSide(view.token0),
                amount: actual.amount0,
              },
              token1: {
                ...publishedSide(view.token1),
                amount: actual.amount1,
              },
              liquidity: actual.liquidity,
              nftTokenId: actual.tokenId,
              amountsEstimated: false,
            });
            return undefined;
          });
        }

        return {
          kind: KIND,
          account: plan.account,
          protocol: plan.protocol,
          positionManager: plan.router,
          recipient: plan.recipient,
          token0: publishedSide(view.token0),
          token1: publishedSide(view.token1),
          ...(minted === undefined ? {} : { nftTokenId: minted }),
          ...(plan.nftTokenId === undefined ? {} : { nftTokenId: plan.nftTokenId }),
          newPosition: plan.newPosition === true,
          feeTier: plan.feeTier,
          tickLower: plan.tickLower,
          tickUpper: plan.tickUpper,
          liquidity: plan.liquidity,
          ...(plan.feeAuto ? { feeAuto: true } : {}),
          ...(plan.tickRangeAuto ? { tickRangeAuto: true } : {}),
          ...(approvalTxIds.length === 0 ? {} : { approvalTxIds }),
          ...outcomeData(main),
          amountsEstimated: true,
          ...settled,
        };
      },
    );
  }

  // A failed post-read must not fail a confirmed deposit.
  async #settleV3(
    scope: TransactionScope,
    network: NetworkDescriptor,
    tokenId: string | undefined,
    liquidityBefore: string,
    outcome: TxOutcome,
  ): Promise<Record<string, unknown>> {
    if (outcome.stage !== "confirmed" || tokenId === undefined) return {};
    let settled: Record<string, unknown> = {};
    await warnOnPostCheck(scope, "sunswap_position_liquidity", async () => {
      const after = await this.liquidity.v3Position(network, tokenId);
      settled = {
        liquidity: (BigInt(after.liquidity) - BigInt(liquidityBefore)).toString(),
        liquidityAfter: after.liquidity,
      };
      return undefined;
    });
    return settled;
  }

  // Read the minted NFT id from the confirmed transaction log.
  async #settleV4Mint(
    scope: TransactionScope,
    network: NetworkDescriptor,
    outcome: TxOutcome,
  ): Promise<Record<string, unknown>> {
    if (outcome.stage !== "confirmed") return {};
    const txId = outcomeTxId(outcome);
    if (txId === undefined) return {};
    let minted: string | undefined;
    await warnOnPostCheck(scope, "sunswap_position_id", async () => {
      minted = await this.liquidity.v4MintedPositionId(network, txId);
      return minted === undefined
        ? "the mint confirmed but its position id could not be read from the transaction log"
        : undefined;
    });
    return minted === undefined ? {} : { nftTokenId: minted, newPosition: true };
  }

  async #mintedPositionId(
    scope: TransactionScope,
    network: NetworkDescriptor,
    plan: LiquidityPlanView,
    outcome: TxOutcome,
  ): Promise<string | undefined> {
    if (!plan.newPosition || outcome.stage !== "confirmed") return undefined;
    const txId = outcomeTxId(outcome);
    if (txId === undefined) return undefined;
    let minted: string | undefined;
    await warnOnPostCheck(scope, "sunswap_position_id", async () => {
      minted = await this.liquidity.v3MintedPositionId(network, txId);
      return minted === undefined
        ? "the mint confirmed but its position id could not be read from the transaction log"
        : undefined;
    });
    return minted;
  }

  async #planV3(
    network: NetworkDescriptor,
    owner: string,
    input: AddLiquidityInput,
  ): Promise<{ plan: LiquidityPlanView; liquidityBefore: string; poolOrder: boolean }> {
    const manager = this.liquidity.contracts(network).v3PositionManager;
    const deadline = resolveDeadline(input.deadline, Date.now());
    const scenario = await this.#v3Scenario(network, owner, input);
    const { pool, tickLower, tickUpper } = scenario;

    if (!pool.exists) {
      throw new ChainError(
        "pool_not_found",
        `no V3 pool exists for that pair at the ${scenario.fee} fee tier`,
      );
    }

    // Size in pool order, then restore input order to keep amounts and minimums bound together.
    const poolOrder = pool.token0.toLowerCase() === scenario.token0.address.toLowerCase();
    const given = poolOrder
      ? { amount0: scenario.amount0, amount1: scenario.amount1 }
      : { amount0: scenario.amount1, amount1: scenario.amount0 };
    let sized: ReturnType<LiquidityPort["v3Amounts"]>;
    try {
      sized = this.liquidity.v3Amounts(pool, { tickLower, tickUpper }, given);
    } catch (error) {
      const required =
        error instanceof UsageError
          ? (error.details as { requiredAmount?: string } | undefined)?.requiredAmount
          : undefined;
      if (!poolOrder && (required === "amount0" || required === "amount1")) {
        const flag = required === "amount0" ? "amount1" : "amount0";
        const token = flag === "amount0" ? scenario.token0 : scenario.token1;
        throw new UsageError(
          "invalid_value",
          `this range takes only ${token.symbol}; give --${flag}`,
          { requiredAmount: flag },
        );
      }
      throw error;
    }
    const amount0 = poolOrder ? sized.amount0 : sized.amount1;
    const amount1 = poolOrder ? sized.amount1 : sized.amount0;

    // Mint rejects zero liquidity; report it before estimation produces a generic revert.
    if (sized.liquidity === "0") {
      throw new UsageError(
        "invalid_value",
        atPriceBound(pool)
          ? `this pool has no established price — it was initialised at tick ${pool.currentTick} and never traded, so a deposit cannot be sized against it; choose a fee tier whose pool has traded`
          : "these amounts are too small for this price range to hold any liquidity; widen the range or deposit more",
      );
    }

    const sides = [
      { facts: scenario.token0, amount: amount0 },
      { facts: scenario.token1, amount: amount1 },
    ];
    await this.#assertBalances(network, owner, sides);
    const approvals = await this.tx.planApprovals(
      network,
      owner,
      manager,
      sides.filter((side) => side.amount !== "0"),
    );

    const plan: LiquidityPlanView = {
      account: owner,
      protocol: "V3",
      router: manager,
      recipient: scenario.recipient,
      deadline,
      token0: {
        address: scenario.token0.address,
        symbol: scenario.token0.symbol,
        decimals: scenario.token0.decimals,
        amount: amount0,
        amountMinimum: this.#v3Minimum(input.min0, scenario.token0),
      },
      token1: {
        address: scenario.token1.address,
        symbol: scenario.token1.symbol,
        decimals: scenario.token1.decimals,
        amount: amount1,
        amountMinimum: this.#v3Minimum(input.min1, scenario.token1),
      },
      ...(scenario.nftTokenId === undefined ? {} : { nftTokenId: scenario.nftTokenId }),
      newPosition: scenario.nftTokenId === undefined,
      feeTier: scenario.fee,
      tickLower,
      tickUpper,
      liquidity: sized.liquidity,
      ...(scenario.feeAuto ? { feeAuto: true } : {}),
      ...(scenario.tickRangeAuto ? { tickRangeAuto: true } : {}),
      ...(atPriceBound(pool) ? { poolHasNoPrice: true } : {}),
      ...(approvals.length === 0 ? {} : { approvals }),
    };
    return { plan, liquidityBefore: scenario.liquidityBefore ?? "0", poolOrder };
  }

  async #v3Scenario(
    network: NetworkDescriptor,
    owner: string,
    input: AddLiquidityInput,
  ): Promise<{
    token0: TokenFacts;
    token1: TokenFacts;
    fee: number;
    tickLower: number;
    tickUpper: number;
    pool: V3PoolState;
    recipient: string;
    amount0?: string;
    amount1?: string;
    nftTokenId?: string;
    feeAuto?: boolean;
    tickRangeAuto?: boolean;
    liquidityBefore?: string;
  }> {
    if (input.positionId !== undefined) {
      const position = await this.#assertPositionOwned(network, input.positionId, owner);
      const [token0, token1] = await Promise.all([
        this.#facts(network, position.token0),
        this.#facts(network, position.token1),
      ]);
      const pool = await this.liquidity.v3PoolState(
        network,
        position.token0,
        position.token1,
        position.fee,
      );
      const amounts = this.#humanAmounts(input, token0, token1);
      return {
        token0,
        token1,
        fee: position.fee,
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
        pool,
        recipient: position.owner,
        ...amounts,
        nftTokenId: position.tokenId,
        liquidityBefore: position.liquidity,
      };
    }

    if (input.token0 === undefined || input.token1 === undefined) {
      throw new UsageError(
        "missing_option",
        "a new V3 position requires --token0 and --token1; use --position-id to add to an existing one",
      );
    }
    // V3 resolves TRX to WTRX and spends the wrapped token.
    const address0 = wrapNative(
      this.liquidity.contracts(network),
      this.tokens.resolve(network, input.token0, RESOLVED),
    );
    const address1 = wrapNative(
      this.liquidity.contracts(network),
      this.tokens.resolve(network, input.token1, RESOLVED),
    );
    if (address0 === address1) {
      throw new ChainError("same_token", "--token0 and --token1 are the same token");
    }
    const [token0, token1] = await Promise.all([
      this.#facts(network, address0),
      this.#facts(network, address1),
    ]);
    const fee = input.fee ?? DEFAULT_V3_FEE_TIER;
    const spacing = tickSpacing(fee);
    const pool = await this.liquidity.v3PoolState(network, address0, address1, fee);
    const range = this.#v3Range(input, pool, spacing);
    return {
      token0,
      token1,
      fee,
      ...range,
      pool,
      recipient: input.recipient ?? owner,
      ...this.#humanAmounts(input, token0, token1),
      ...(input.fee === undefined ? { feeAuto: true } : {}),
    };
  }

  // Validate caller ticks without rounding; moving a boundary changes the requested range.
  #v3Range(
    input: AddLiquidityInput,
    pool: V3PoolState,
    spacing: number,
  ): { tickLower: number; tickUpper: number; tickRangeAuto?: boolean } {
    if (input.tickLower !== undefined || input.tickUpper !== undefined) {
      if (input.tickLower === undefined || input.tickUpper === undefined) {
        throw new UsageError(
          "missing_option",
          "--tick-lower and --tick-upper must be given together",
        );
      }
      assertAligned(input.tickLower, spacing, "--tick-lower");
      assertAligned(input.tickUpper, spacing, "--tick-upper");
      assertRange(input.tickLower, input.tickUpper);
      return { tickLower: input.tickLower, tickUpper: input.tickUpper };
    }
    const range = defaultTickRange(pool.currentTick, spacing);
    assertRange(range.tickLower, range.tickUpper);
    return { ...range, tickRangeAuto: true };
  }

  #humanAmounts(
    input: AddLiquidityInput,
    token0: TokenFacts,
    token1: TokenFacts,
  ): { amount0?: string; amount1?: string } {
    if (input.amount0 === undefined && input.amount1 === undefined) {
      throw new UsageError(
        "missing_option",
        "this command requires --amount0 or --amount1; give one and the other is derived from the range, or give both",
      );
    }
    return {
      ...(input.amount0 === undefined ? {} : { amount0: base(input.amount0, token0, "--amount0") }),
      ...(input.amount1 === undefined ? {} : { amount1: base(input.amount1, token1, "--amount1") }),
    };
  }

  #v3Minimum(explicit: string | undefined, facts: TokenFacts): string {
    return explicit === undefined ? "0" : base(explicit, facts, "--min");
  }

  // V3 permits funding another owner's position; reject mistyped ids locally.
  async #assertPositionOwned(
    network: NetworkDescriptor,
    tokenId: string,
    owner: string,
  ): Promise<V3Position> {
    const position = await readPosition("V3", tokenId, network, () =>
      this.liquidity.v3Position(network, tokenId),
    );
    if (position.owner !== owner) {
      throw new UsageError(
        "invalid_value",
        `position ${tokenId} is held by ${position.owner}, not by this account`,
      );
    }
    return position;
  }

  #v3DepositPayload(network: NetworkDescriptor, plan: LiquidityPlanView): ContractCallPayload {
    if (plan.nftTokenId !== undefined && !plan.newPosition) {
      return this.liquidity.v3IncreasePayload(network, {
        tokenId: plan.nftTokenId,
        amount0Desired: plan.token0.amount,
        amount1Desired: plan.token1.amount,
        amount0Min: plan.token0.amountMinimum,
        amount1Min: plan.token1.amountMinimum,
        deadline: plan.deadline,
      });
    }
    return this.liquidity.v3MintPayload(network, {
      token0: sideFacts(plan.token0),
      token1: sideFacts(plan.token1),
      fee: plan.feeTier ?? DEFAULT_V3_FEE_TIER,
      tickLower: plan.tickLower ?? 0,
      tickUpper: plan.tickUpper ?? 0,
      amount0Desired: plan.token0.amount,
      amount1Desired: plan.token1.amount,
      amount0Min: plan.token0.amountMinimum,
      amount1Min: plan.token1.amountMinimum,
      recipient: plan.recipient,
      deadline: plan.deadline,
    });
  }

  // Native TRX must travel as call value, not a token argument.
  #depositPayload(network: NetworkDescriptor, plan: LiquidityPlanView): ContractCallPayload {
    if (plan.protocol === "V3") return this.#v3DepositPayload(network, plan);
    const native = isNative(plan.token0.address)
      ? { native: plan.token0, token: plan.token1 }
      : isNative(plan.token1.address)
        ? { native: plan.token1, token: plan.token0 }
        : undefined;
    if (native) {
      return this.liquidity.v2AddLiquidityEthPayload(network, {
        token: sideFacts(native.token),
        amountTokenDesired: native.token.amount,
        amountTokenMin: native.token.amountMinimum,
        amountNativeDesired: native.native.amount,
        amountNativeMin: native.native.amountMinimum,
        recipient: plan.recipient,
        deadline: plan.deadline,
      });
    }
    return this.liquidity.v2AddLiquidityPayload(network, {
      token0: sideFacts(plan.token0),
      token1: sideFacts(plan.token1),
      amount0Desired: plan.token0.amount,
      amount1Desired: plan.token1.amount,
      amount0Min: plan.token0.amountMinimum,
      amount1Min: plan.token1.amountMinimum,
      recipient: plan.recipient,
      deadline: plan.deadline,
    });
  }

  async #planV2(
    network: NetworkDescriptor,
    owner: string,
    input: AddLiquidityV2Input,
  ): Promise<{ plan: LiquidityPlanView; pair: V2PairState }> {
    const router = this.liquidity.contracts(network).v2Router;
    // Resolve aliases before comparing token identity.
    const address0 = this.tokens.resolve(network, input.token0, RESOLVED);
    const address1 = this.tokens.resolve(network, input.token1, RESOLVED);
    if (address0 === address1) {
      throw new ChainError("same_token", "--token0 and --token1 are the same token");
    }
    const [token0, token1] = await Promise.all([
      this.#facts(network, address0),
      this.#facts(network, address1),
    ]);
    // The router wraps native TRX; lookup uses WTRX while receipts retain TRX.
    const pair = await this.liquidity.v2PairState(
      network,
      poolSideOf(this.liquidity.contracts(network), token0.address),
      poolSideOf(this.liquidity.contracts(network), token1.address),
    );
    const amounts = this.#resolveAmounts(input, token0, token1, pair);
    const recipient = input.recipient ?? owner;
    const deadline = resolveDeadline(input.deadline, Date.now());

    const sides = [
      { facts: token0, amount: amounts.amount0 },
      { facts: token1, amount: amounts.amount1 },
    ];
    await this.#assertBalances(network, owner, sides);
    // Native TRX travels as call value and needs no token allowance.
    const approvals = await this.tx.planApprovals(
      network,
      owner,
      router,
      sides.filter((side) => !isNative(side.facts.address)),
    );

    const lpAmountExpected = expectedLpAmount(
      amounts.amount0,
      amounts.amount1,
      pair.reserve0,
      pair.reserve1,
      pair.totalSupply,
    );

    const plan: LiquidityPlanView = {
      account: owner,
      protocol: "V2",
      router,
      recipient,
      deadline,
      ...(lpAmountExpected === undefined ? {} : { lpAmountExpected, lpDecimals: pair.lpDecimals }),
      token0: {
        address: token0.address,
        symbol: token0.symbol,
        decimals: token0.decimals,
        amount: amounts.amount0,
        amountMinimum: this.#minimum(input.min0, amounts.amount0, token0),
      },
      token1: {
        address: token1.address,
        symbol: token1.symbol,
        decimals: token1.decimals,
        amount: amounts.amount1,
        amountMinimum: this.#minimum(input.min1, amounts.amount1, token1),
      },
      ...(approvals.length === 0 ? {} : { approvals }),
    };
    return { plan, pair };
  }

  #resolveAmounts(
    input: AddLiquidityV2Input,
    token0: TokenFacts,
    token1: TokenFacts,
    pair: V2PairState,
  ): { amount0: string; amount1: string } {
    const selection = selectAmounts(
      input.amount0 === undefined ? undefined : base(input.amount0, token0, "--amount0"),
      input.amount1 === undefined ? undefined : base(input.amount1, token1, "--amount1"),
    );
    if (selection.kind === "both") {
      return { amount0: selection.amount0, amount1: selection.amount1 };
    }
    // An empty pool has no ratio; its first deposit must supply both sides.
    if (!pair.exists || pair.totalSupply === "0") {
      throw new ChainError(
        "pool_not_found",
        "this pool does not exist yet, so there is no ratio to derive the other side from; give both --amount0 and --amount1",
      );
    }
    if (selection.kind === "amount0") {
      return {
        amount0: selection.amount0,
        amount1: pairAmount(selection.amount0, pair.reserve0, pair.reserve1),
      };
    }
    return {
      amount0: pairAmount(selection.amount1, pair.reserve1, pair.reserve0),
      amount1: selection.amount1,
    };
  }

  #minimum(explicit: string | undefined, amount: string, facts: TokenFacts): string {
    if (explicit === undefined) return applyMinimumShare(amount, DEFAULT_V2_MIN_BASIS_POINTS);
    return base(explicit, facts, "--min");
  }

  async #facts(network: NetworkDescriptor, address: string): Promise<TokenFacts> {
    if (isNative(address)) return { address, decimals: 6, symbol: "TRX" };
    return this.liquidity.tokenFacts(network, address);
  }

  async #assertBalances(
    network: NetworkDescriptor,
    owner: string,
    sides: { facts: TokenFacts; amount: string }[],
  ): Promise<void> {
    for (const side of sides) {
      const held = isNative(side.facts.address)
        ? await this.liquidity.nativeBalance(network, owner)
        : await this.liquidity.balanceOf(network, side.facts.address, owner);
      if (BigInt(held) < BigInt(side.amount)) {
        throw new ChainError(
          "insufficient_token_balance",
          `this deposit needs ${side.amount} of ${side.facts.symbol} in base units and the account holds ${held}`,
        );
      }
    }
  }
}

// V4 deposits enforce ceilings; omit the shared plan's unused minimum placeholders.
function withoutV4Minimum<T extends { token0: object; token1: object }>(plan: T): T {
  const strip = (side: object): object => {
    const { amountMinimum: _dropped, ...rest } = side as { amountMinimum?: unknown };
    return rest;
  };
  return { ...plan, token0: strip(plan.token0), token1: strip(plan.token1) } as T;
}

// Preserve parameters verbatim; changing any bit changes the pool identity.
function keyOf(pool: V4PoolState): V4DepositRequest["pool"] {
  return {
    currency0: pool.currency0,
    currency1: pool.currency1,
    hooks: pool.hooks,
    fee: pool.fee,
    parameters: pool.parameters,
  };
}

function base(human: string, facts: TokenFacts, flag: string): string {
  return toBaseUnits(human, facts.decimals, facts.symbol, flag);
}

function sideFacts(side: PlannedSide): TokenFacts {
  return { address: side.address, decimals: side.decimals, symbol: side.symbol };
}

// Preview liquidity is an estimate, not a confirmed settlement.
function asPositionPreview<T extends { readonly router: string; readonly liquidity?: string }>(
  view: T,
) {
  const { router, liquidity, ...rest } = view;
  return {
    ...rest,
    positionManager: router,
    ...(liquidity === undefined ? {} : { liquidityExpected: liquidity }),
  };
}

function publishedSide(side: PlannedSide): Record<string, unknown> {
  return {
    address: side.address,
    symbol: side.symbol,
    decimals: side.decimals,
    amount: side.amount,
  };
}

function atPriceBound(pool: V3PoolState): boolean {
  return pool.exists && (pool.currentTick <= MIN_TICK || pool.currentTick >= MAX_TICK);
}

// V3 uses WTRX for native-token input.
function wrapNative(contracts: LiquidityContractAddresses, address: string): string {
  return isNative(address) ? poolSideOf(contracts, address) : address;
}

function isNative(address: string): boolean {
  return address === NATIVE_TRX_ADDRESS;
}

// V2 pools hold WTRX; the router wraps native TRX.
function poolSideOf(contracts: LiquidityContractAddresses, address: string): string {
  return isNative(address) ? contracts.wtrx : address;
}

// Slippage widens deposit ceilings upward.
function raiseBy(amount: string, bips: number): string {
  if (bips === 0) return amount;
  return ((BigInt(amount) * BigInt(10_000 + bips)) / 10_000n).toString();
}

// Validate the SDK permit domain against the independent network descriptor.
function v4ChainId(network: NetworkDescriptor): string {
  const id = (network as { chainId?: unknown }).chainId;
  if (typeof id === "string" && /^\d+$/.test(id)) return id;
  throw new ChainError(
    "provider_error",
    `network ${network.id} carries no numeric chain id, so a Permit2 domain cannot be checked against it`,
  );
}
