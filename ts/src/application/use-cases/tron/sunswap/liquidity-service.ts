import { initialPrice } from "../../../../domain/sunswap/initial-price.js";
import { resolveTronAccount } from "../../../services/tron-account.js";
/**
 * SunSwap liquidity — validation, planning, and the approval sequence.
 *
 * This is the first SunSwap code that moves money, and the rules are not the query rules:
 *
 * - Every transaction goes through `TxPipeline`. Nothing here builds, signs or broadcasts on its
 *   own, so `--dry-run`, permission handling, confirmation and the receipt shape are the ones the
 *   rest of the CLI already guarantees.
 * - An approval and the call that spends it are SEQUENTIAL and confirmed: approve, wait, re-read
 *   the allowance from the chain, then the main call. Firing both and hoping the node orders them
 *   is how an approval lands second and the deposit reverts having spent a fee.
 * - `--dry-run` validates without a signer. It must work for a watch-only account, so nothing on
 *   that path may resolve a key.
 * - A call whose allowance is not on-chain yet is NOT estimated: the estimate is a simulation,
 *   the simulation reverts, and the command would fail instead of answering — see
 *   `#estimatorFor`.
 */
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

/**
 * The lookup for the resolution further in. The entry has already resolved `token0`/`token1`
 * against the account's book, so what reaches these calls is an address (a pass-through) or a
 * builtin; a caller that skipped the entry gets the official layer only.
 */
const RESOLVED = { caller: "liquidity" } as const;

/** The receipt's `kind`, one value across every mode this command has. */
const KIND = "sunswap-add-liquidity" as const;

/**
 * The TRC20 allowance a V4 deposit grants to Permit2: UNLIMITED.
 *
 * V4 liquidity is one of exactly two paths that grant Permit2 an unlimited allowance, and it is the
 * OPPOSITE of what `sunswap swap` does on its own Permit2 approval. The allowance is decided per
 * path, not by analogy with the neighbouring code — and the two paths sit one file apart.
 */
const V4_TRC20_ALLOWANCE = (2n ** 256n - 1n).toString();

/** How long a V4 deposit's Permit2 grants live. Exact amount, one hour. */
const V4_PERMIT_TTL_SECONDS = 3600;

export interface AddLiquidityInput extends TransactionModeInput {
  readonly protocol: string;
  /** symbol or contract address; resolved here, so a symbol reaches the chain as an address. */
  readonly token0?: string;
  readonly token1?: string;
  /** human decimal amounts, as typed. */
  readonly amount0?: string;
  readonly amount1?: string;
  readonly min0?: string;
  readonly min1?: string;
  readonly recipient?: string;
  /** Unix seconds. */
  readonly deadline?: number;
  /** cap on the energy fee this call may burn, in SUN. */
  readonly feeLimit?: string;
  /** V3 only: the NFT id of a position to add to, instead of minting a new one. */
  readonly positionId?: string;
  /** V3 new position only; on V4 it is part of the pool key, for an existing pool and a new one alike. */
  readonly fee?: number;
  readonly tickLower?: number;
  readonly tickUpper?: number;
  /** V4: create the pool as part of the deposit. Travels with `sqrtPrice`. */
  readonly createPool?: boolean;
  /** V4 creation: the starting price, Q64.96. */
  readonly sqrtPrice?: string;
  /**
   * V4, REQUIRED: the pool's tick spacing, part of its identity rather than implied by the fee tier.
   *
   * There is no default and none can be invented: measured on Nile, two pools both at fee 500 have
   * spacings 12 and 10. A defaulted spacing would name a different pool, and when that pool exists
   * the deposit lands in a market nobody chose.
   */
  readonly tickSpacing?: number;
  /** V4: the hook contract, or none. */
  readonly hooks?: string;
  /**
   * V4: tolerance on the deposit CEILING, as a decimal.
   *
   * The opposite of `min0` / `min1`. Unset means the ceiling is exactly the computed amounts, which
   * is the default and is measured to work — a mint with an exact ceiling succeeded on Nile once
   * the sizing used the pool's own price.
   */
  readonly slippage?: string;
}

/** The V2 shape, kept as its own name because V2's two sides are always both named. */
export type AddLiquidityV2Input = AddLiquidityInput & {
  readonly token0: string;
  readonly token1: string;
};

/** What a caller is told before anything is signed, and what the receipt echoes afterwards. */
export interface LiquidityPlanView {
  /** the account the deposit comes out of — the text receipt leads with it. */
  readonly account: string;
  readonly protocol: "V2" | "V3" | "V4";
  /**
   * The contract this deposit is made through: the V2 router, or the V3 / V4 position manager.
   *
   * Internal name only. V3 and V4 publish it as `positionManager` — see
   * `withPositionManager` in `liquidity-transactions.ts`.
   */
  readonly router: string;
  readonly recipient: string;
  readonly deadline: number;
  readonly token0: PlannedSide;
  readonly token1: PlannedSide;
  /** LP tokens this deposit should mint; absent when the pool's supply cannot answer it. */
  readonly lpAmountExpected?: string;
  /** the LP token's decimals, so the figure above can be shown as a person reads it. */
  readonly lpDecimals?: number;
  /** the approvals this plan needs; absent entirely when the allowances already suffice. */
  readonly approvals?: readonly ApprovalPlan[];

  // ── V3 ──────────────────────────────────────────────────────────────────────
  /** the position being added to; absent when this mints a new one. */
  readonly nftTokenId?: string;
  /** true when this deposit creates the position rather than adding to one. */
  readonly newPosition?: boolean;
  /**
   * The V3 fee tier, in hundredths of a basis point (3000 = 0.3%).
   *
   * NOT `fee`: that key belongs to the estimated-cost object on every dry run. One key meaning
   * two different things depending on mode is how a script reads a tier as a cost, so the tier
   * is named for what it is and `fee` stays the estimate.
   */
  readonly feeTier?: number;
  readonly tickLower?: number;
  readonly tickUpper?: number;
  /** the liquidity these amounts fund. Published as `liquidityExpected` by a preview. */
  readonly liquidity?: string;
  /** set when the CLI chose the tier or the range, so a receipt says which values were used and
   *  that they were not the caller's. */
  readonly feeAuto?: boolean;
  readonly tickRangeAuto?: boolean;
  /** the pool holds a price at the very edge of the representable range — it was initialised and
   *  never traded, so a deposit into it lands on one side only. */
  readonly poolHasNoPrice?: boolean;

  // ── V4 ──────────────────────────────────────────────────────────────────────
  /** the 32-byte pool id. A V4 pool has no address, so this is what names it. */
  readonly poolId?: string;
  /** the pool's tick spacing, which on V4 is part of its identity rather than implied by the tier. */
  readonly tickSpacing?: number;
  /** the hook contract, or `none`. Never the zero address, which reads as native TRX. */
  readonly hooks?: string;
  /** true when the deposit initialises the pool as well as funding it. */
  readonly poolCreated?: boolean;
  /** The requested initial Q64.96 price, only for a pool creation. */
  readonly initialSqrtPriceX96?: string;
  /**
   * The CEILING on each side, base units — the opposite of `amountMinimum`.
   *
   * Absent when it equals the deposit, which is the default: a line that is always there stops being
   * read, and it is only worth saying when a tolerance has moved it.
   */
  readonly amount0Max?: string;
  readonly amount1Max?: string;
  /**
   * TRX the transaction LOCKS on a native pair, which is the ceiling rather than the deposit.
   *
   * Measured: a native V4 deposit sends the ceiling as the call's value and has the remainder swept
   * back. So the balance a caller needs is this, not the amount that ends up in the pool. Absent when
   * the two are equal, or when neither side is native.
   */
  readonly nativeLocked?: string;
  /** the grants this deposit signs, one per token that needed one. Absent when none did. */
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
  /** base units to deposit. */
  readonly amount: string;
  /** base units below which the deposit should revert. */
  readonly amountMinimum: string;
}

/**
 * A V4 deposit, planned: what to tell the caller, and what to send.
 *
 * `call` is a discriminated union rather than one request with optional fields. A mint has an owner
 * and a range; an increase has a token id and neither. One shape covering both would make every
 * field optional and let a mint be built with no range at all.
 */
interface PlannedV4 {
  readonly plan: LiquidityPlanView;
  readonly pool: V4PoolState;
  readonly permitsNeeded: readonly { token: string; amount: string }[];
  readonly call:
    | { readonly kind: "mint"; readonly request: Omit<V4DepositRequest, "permits"> }
    | { readonly kind: "increase"; readonly request: Omit<V4IncreaseRequest, "permits"> };
  /** what the position already held, so a confirmed receipt can report what THIS call added. */
  readonly liquidityBefore?: string;
}

/** The sizing a V4 deposit shares across both its scenarios. */
interface V4Sizing {
  readonly facts0: TokenFacts;
  readonly facts1: TokenFacts;
  /** what each side deposits, and the liquidity it funds. */
  readonly plan: { readonly amount0: string; readonly amount1: string; readonly liquidity: string };
  /** the tolerance applied to the ceiling, in basis points. Zero is the default. */
  readonly bips: number;
  readonly amount0Max: string;
  readonly amount1Max: string;
  readonly permitsNeeded: readonly { token: string; amount: string; facts: TokenFacts }[];
  readonly approvals: readonly ApprovalPlan[];
  /** TRX the call locks on a native pair — present only when a tolerance moved it off the deposit. */
  readonly nativeLocked?: string;
}

export class SunSwapLiquidityService {
  /**
   * The shared transaction mechanics are built here rather than injected: they are an
   * implementation detail of how this service talks to the chain, not a collaborator a caller
   * chooses. Keeping them out of the signature is also what let the extraction land without
   * touching a single existing test.
   */
  private readonly tx: LiquidityTransactions;

  constructor(
    private readonly liquidity: LiquidityPort,
    gateways: ChainGatewayProvider,
    pipeline: TxPipeline,
    private readonly tokens: SunSwapTokenResolver,
    private readonly permits: Permit2Port,
    /** for the V4 Permit2 grants, which are typed data rather than transactions. */
    private readonly signers: SignerResolver,
  ) {
    this.tx = new LiquidityTransactions(liquidity, gateways, pipeline);
  }

  /**
   * One entry for both protocols. V2 deposits at the pool's ratio; V3 opens or adds to a position
   * over a price range. They share everything after the plan — the approval sequence, the fee
   * gate, the modes — because those are properties of moving money on TRON, not of the protocol.
   */
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
    const protocol = resolved.protocol.toUpperCase();
    const result =
      protocol === "V4"
        ? await this.addLiquidityV4(scope, network, resolved)
        : protocol === "V3"
          ? await this.addLiquidityV3(scope, network, resolved)
          : await this.addLiquidityV2(scope, network, resolved as AddLiquidityV2Input);
    return withTokenBook(result, book.resolved);
  }

  /**
   * A V4 deposit.
   *
   * The order is the design and it is measured, not chosen: the TRC20 allowance to Permit2 must exist
   * before Permit2 can move anything, the grants are signed after that and checked on both sides of
   * signing, and the deposit then goes out as ONE call carrying the grants with it. Verified on Nile.
   *
   * What separates this from V3 is the direction of the bound. V4 caps a deposit from ABOVE, so the
   * figures this plans are a CEILING the contract's own recomputation must fit under — and on a native
   * pair that ceiling is LOCKED as the call's value, which is what the balance is checked against.
   */
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
    // What leaves this method never carries a V4 minimum; see `withoutV4Minimum`.
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
      // The deposit embeds the signed grants, so it cannot be built before they exist — the same
      // reason `sunswap swap` refuses it on a router pair. When the standing grants already cover the
      // amounts there is nothing to sign and the call DOES build, which is why this is not a blanket
      // refusal on the protocol.
      throw new UsageError(
        "invalid_option",
        "--build-only is not available for this V4 deposit: it carries Permit2 grants inside the call, so it cannot be built before they are signed. --dry-run validates it, and a deposit whose Permit2 grants already cover the amounts has nothing to sign and does build",
      );
    }

    if (mode.dryRun) {
      // The deposit itself cannot be priced while a grant is still unsigned, for the same reason as
      // above, so the approvals are priced for real and the plan says what it would authorize.
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

    // The TRC20 allowance to Permit2, UNLIMITED on this path. V4 liquidity is one of exactly two
    // paths that grant it, and it is the opposite of what `sunswap swap` does — decided per path,
    // not by analogy with the neighbouring code.
    return this.tx.withApprovals(
      scope,
      network,
      plan.approvals ?? [],
      owner,
      mode,
      input.feeLimit,
      async (approvalTxIds) => {
        const permits = await this.#signV4Permits(scope, network, owner, pool, permitsNeeded);

        // Read the holder again, immediately before sending: a dry run can be minutes old, and an
        // increase must not be sent against a position that changed hands in between. The
        // same guard V3's increase and the V4 withdrawal run, for the same reason.
        if (call.kind === "increase") {
          await this.#assertV4PositionOwned(network, call.request.tokenId, owner);
        } else if (
          call.request.initialSqrtPriceX96 !== undefined &&
          (await this.liquidity.v4PoolState(network, pool.poolId)).exists
        ) {
          // Permit approvals and device prompts may take minutes. initializePool catches an already-
          // initialized error, so do not knowingly mint at a price different from the planned one.
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
        // What the position actually gained, read back — the planned figure is what the amounts were
        // worth a moment earlier, and the pool credits at its own price.
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
          // A build is still a preview, so its liquidity is the planned one.
          ...(mode.buildOnly ? asPositionPreview(view) : withPositionManager(view)),
          ...(approvalTxIds.length === 0 ? {} : { approvalTxIds }),
          ...outcomeData(main),
          // Last, so the liquidity the position actually gained replaces the one that was planned.
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

    // A dry run answers without a key: it must work for a watch-only account, so
    // the signer assertion happens only on a path that will actually sign.
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
        // Every approval above is confirmed and re-read by the time this runs, so the deposit's
        // preconditions hold and its estimate is a real one.
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
          // Last, so the amounts the chain actually took replace the ones that were requested.
          amountsEstimated: true,
          ...settled,
        };
      },
    );
  }

  /**
   * Everything a V4 deposit needs, decided before anything is sent.
   *
   * Two scenarios, and which one this is turns on `--position-id` alone. Without it the caller names
   * a pool and a new position is minted; with it the caller names a position they already hold and it
   * grows. Both end in the same sizing, the same ceiling and the same approvals — an increase IS a
   * deposit — so only what names the pool and what the call carries differ.
   */
  async #planV4(
    network: NetworkDescriptor,
    owner: string,
    input: AddLiquidityInput,
  ): Promise<PlannedV4> {
    return input.positionId === undefined
      ? this.#planV4Mint(network, owner, input)
      : this.#planV4Increase(network, owner, input, input.positionId);
  }

  /**
   * A V4 deposit that mints a new position.
   *
   * The pool comes from the chain when it exists and from the caller's own `--sqrt-price` when it does
   * not — and the creating path must NOT read chain state for its price, because an uninitialised pool
   * reports zero and the zero-price guard would refuse the one caller entitled to proceed.
   */
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

    /*
     * The id, computed from the key rather than asked for.
     *
     * The same derivation the pool manager itself uses, over the same five parts, so the pool a
     * caller creates and the pool they later deposit into are reached by one road.
     */
    const poolId = this.liquidity.v4PoolIdOf(network, target);
    const pool =
      target.kind === "existing"
        ? await this.liquidity.v4PoolState(network, poolId)
        : this.#createdPool(target, poolId);
    /*
     * Creating a pool that is already live is refused rather than planned.
     *
     * The creating path sizes at the caller's `--sqrt-price`, not the pool's — that is its point — so
     * on a live pool it would size for a price the pool does not have and report a creation that
     * never happens. Only existence is read here; the price stays the caller's.
     */
    if (target.kind === "create" && (await this.liquidity.v4PoolState(network, poolId)).exists) {
      throw new ChainError(
        "pool_already_exists",
        `a V4 pool already exists with currency0 ${target.token0}, currency1 ${target.token1}, fee ${target.fee}, tick spacing ${target.tickSpacing} and hooks ${describeHooks(target.hooks)} (pool id ${poolId}). Deposit into it without --create-pool and --sqrt-price`,
      );
    }
    if (target.kind === "existing" && !pool.exists) {
      /*
       * A key that hashes to nothing, said as what it is.
       *
       * The spacing is named first because it is the likeliest part to be wrong: it is the one part
       * of the key that cannot be guessed from the pair and the tier, and V3's habit of deriving it
       * from the tier does not hold here.
       */
      throw new ChainError(
        "pool_not_found",
        `no V4 pool exists with currency0 ${target.token0}, currency1 ${target.token1}, fee ${target.fee}, tick spacing ${target.tickSpacing} and hooks ${describeHooks(target.hooks)} — that key hashes to pool id ${poolId}, which nothing has initialised. Check --tick-spacing first: it is part of the pool's identity and is not implied by --fee, so a pool at this fee tier may well exist at a different spacing. 'sunswap pool-list --protocol V4' publishes each pool's tickSpacing and hooks; --create-pool with --sqrt-price makes this one`,
      );
    }

    // The range: the caller's, checked against the POOL's spacing, or the default around its price.
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
          // Back to the depositor. On a token pair this is inert — measured — and on a native pair it is
          // where the unspent part of the ceiling returns.
          sweepRecipient: owner,
          deadline,
        },
      },
    };
  }

  /**
   * A V4 deposit into a position that already exists.
   *
   * The position is the authority on everything about the pool: which one it is, and the range the
   * deposit lands in. `--token0` / `--token1` are REQUIRED here and yet select nothing — they are a
   * CROSS-CHECK against the pair the position holds, which is the one place this command asks for more
   * than V3's increase does. The asymmetry is deliberate and the check is what earns it:
   * a caller who typed the wrong position id is refused rather than funded into a market they did not
   * mean. `--fee` is checked the same way when given. Both mirror `remove-liquidity`'s V4 path.
   */
  async #planV4Increase(
    network: NetworkDescriptor,
    owner: string,
    input: AddLiquidityInput,
    positionId: string,
  ): Promise<PlannedV4> {
    /*
     * Defensive restatements. The command schema refuses each of these at parse time, where the
     * refusal is deterministic and needs no wallet; they are repeated because the use case is also
     * reachable directly, and each one accepted-and-ignored would misstate what was sent — a
     * recipient the NFT never goes to, or a range a position cannot be given.
     */
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

    // The position's own range, never the caller's: `--tick-lower` / `--tick-upper` are refused above.
    const range = { tickLower: position.tickLower, tickUpper: position.tickUpper };
    const sized = await this.#sizeV4(network, owner, input, pool, range);
    const deadline = resolveDeadline(input.deadline, Date.now());

    return {
      plan: {
        // The NFT is already held; an increase does not re-address it, so the recipient is its holder.
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
          // VERBATIM from the pool the position reports. `parameters` is never re-encoded from the
          // tick spacing: that would be our guess at a layout the pool has already told us.
          pool: keyOf(pool),
          tokenId: position.tokenId,
          liquidity: sized.plan.liquidity,
          amount0Max: sized.amount0Max,
          amount1Max: sized.amount1Max,
          // The signing account, whose Permit2 grants the multicall forwards.
          owner,
          sweepRecipient: owner,
          deadline,
        },
      },
      liquidityBefore: position.liquidity,
    };
  }

  /**
   * The sizing every V4 deposit shares: the amounts, the ceiling, the grants and the approvals.
   *
   * One implementation for the mint and the increase on purpose. The CEILING's default is the part
   * that must not drift: with no `--slippage` it is EXACTLY the computed amounts, which is the
   * default and is measured to work — a Nile mint with zero tolerance succeeded once the sizing used
   * the pool's own `sqrtPriceX96`. Two copies of that rule is how one of them later gains a margin.
   */
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
    // From the pool's own sqrtPriceX96, never from the tick: the tick is the lower edge of a band
    // rather than the price, and sizing from it reverted a real mint by 1.73%.
    const plan = this.liquidity.v4Amounts(pool, range, given);

    /**
     * The CEILING. A tolerance only ever raises it — it is a cap, so widening is the only direction
     * that makes sense, and narrowing it below the computed amount would revert every deposit.
     */
    const bips = input.slippage === undefined ? 0 : slippageToBips(input.slippage);
    const amount0Max = raiseBy(plan.amount0, bips);
    const amount1Max = raiseBy(plan.amount1, bips);

    const permitsNeeded = [
      { token: pool.currency0, amount: amount0Max, facts: facts0 },
      { token: pool.currency1, amount: amount1Max, facts: facts1 },
      // Native TRX has no allowance and no permit: it travels as the call's value.
    ].filter((side) => !isNative(side.token) && BigInt(side.amount) > 0n);

    const permit2 = await this.liquidity.permit2Address(network);
    const approvals = await this.tx.planApprovals(
      network,
      owner,
      permit2,
      // Compare the deposit ceiling with the existing allowance. Only an insufficient
      // allowance is replaced with the V4 unlimited TRC20 grant.
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
      // THE CEILING, not the deposit. A native V4 deposit sends the ceiling as the call's value and has
      // the remainder swept back, so the balance that must cover it is the ceiling — measured, and the
      // reason the phase C wording "the deposit and the fee" is wrong for this path.
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

  /** The plan rows both V4 scenarios share, so a mint and an increase report the same way. */
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
      // Said only when a tolerance moved it. A line that is always there stops being read, which is
      // the same rule the approvals follow.
      ...(sized.bips === 0 ? {} : { amount0Max: sized.amount0Max, amount1Max: sized.amount1Max }),
      ...(sized.nativeLocked === undefined ? {} : { nativeLocked: sized.nativeLocked }),
    };
  }

  /**
   * The grants a plan will sign, absent entirely when the standing ones already cover it.
   *
   * `expiration` is the GRANT's expiry — `now + V4_PERMIT_TTL_SECONDS`, the same bound
   * `#signV4Permits` asserts before signing — and not the transaction's deadline. An earlier
   * version printed the deadline here (30 minutes) while signing a one-hour grant, so the preview
   * told a caller the authorisation lapsed half an hour before it actually did.
   */
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

  /** The call this plan sends, with the grants it ended up signing folded in. */
  #v4Payload(
    network: NetworkDescriptor,
    call: PlannedV4["call"],
    permits: readonly { grant: unknown; signature: string }[],
  ): ContractCallPayload {
    return call.kind === "increase"
      ? this.liquidity.v4IncreasePayload(network, { ...call.request, permits })
      : this.liquidity.v4DepositPayload(network, { ...call.request, permits });
  }

  /**
   * Require the position's currency order: amount0/amount1 are sized in that order.
   * Accepting a reversed pair would attach the caller's amounts to the wrong assets.
   */
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

  /** A V4 position, and that this account is the one entitled to add to it. */
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

  /**
   * A pool the caller is creating, as a pool state.
   *
   * Its price is the caller's `--sqrt-price` and NOT read from the chain: an uninitialised pool reports
   * zero, and the zero-price guard would refuse the one caller who supplied a price and is entitled to
   * proceed. The tick is derived from that price for the automatic range; sizing uses the price
   * itself, preserving its precision within the tick.
   */
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

  /** A caller's V4 range, checked against the POOL's spacing rather than a fee tier's. */
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

  /** Token facts, with native TRX answered from the chain's own definition of SUN. */
  async #v4Facts(network: NetworkDescriptor, address: string): Promise<TokenFacts> {
    if (address === NATIVE_TRX_ADDRESS) return { address, symbol: "TRX", decimals: 6 };
    return this.#facts(network, address);
  }

  /**
   * The grants, checked before signing and their signer after.
   *
   * The same two guards the router swap uses, with the V4 POSITION MANAGER as the spender instead of
   * the router. That substitution is the whole reason Permit2 planning is its own port.
   */
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
      // Already covered by a standing grant. Measured on Nile, and fine here: the deposit carries the
      // grants it needs and simply carries one fewer.
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

  /**
   * How much liquidity the position actually gained.
   *
   * Best-effort, like V3's: the deposit is already on chain, so a read that failed costs the figure
   * and not the position.
   */
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

  /**
   * The native balance must cover the CEILING, not the deposit.
   *
   * Measured: a native V4 deposit sends the ceiling as the call's value and has the remainder swept
   * back, so an account holding only the deposit amount cannot send it. The phase C wording — "the
   * balance covers the deposit and the fee" — is wrong for this path, and checking the deposit would
   * pass a transaction the node then refuses.
   *
   * The energy fee is deliberately NOT added. It is paid in burned TRX or from the account's energy,
   * the estimate is a lower bound, and adding an estimate to a requirement refuses deposits that would
   * have succeeded.
   */
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

  /**
   * V3: mint a new position, or add to one that exists.
   *
   * Two scenarios rather than one flag. A mint names the pair, the tier and the range; an
   * increase names only the position, and reads all three off it — because a position's range is
   * fixed at birth and re-stating it would invite a caller to believe it could be changed.
   */
  async addLiquidityV3(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: AddLiquidityInput,
  ): Promise<Record<string, unknown>> {
    const owner = resolveTronAccount(scope);
    const { plan, liquidityBefore, poolOrder } = await this.#planV3(network, owner, input);
    // Inputs and payload construction retain the caller's order; all position views use
    // pool order so the receipt's token0 matches a later --position-id --amount0.
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
        // Read again, immediately before sending: a dry run can be minutes old, and an increase must
        // not be sent against a position that changed hands in between.
        if (plan.nftTokenId !== undefined && !plan.newPosition) {
          await this.#assertPositionOwned(network, plan.nftTokenId, owner);
        }

        const main = await this.tx.run(scope, network, this.#depositPayload(network, plan), {
          mode,
          estimable: true,
          feeLimit: input.feeLimit,
        });

        // A new position's id is assigned during execution, so nothing before the receipt can know
        // it — and on Nile `position-list` cannot tell a caller afterwards, which is why help says to
        // pass --wait.
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
          // Last, so the liquidity the position actually gained replaces the one that was planned.
          amountsEstimated: true,
          ...settled,
        };
      },
    );
  }

  /**
   * How much liquidity the position actually gained.
   *
   * The planned figure is what the amounts were worth a moment before the transaction; a V3 pool
   * takes them at its own price, so what it credits is routinely a little less. Reading the
   * position back is the only honest answer, and it is also the number a later
   * `remove-liquidity --liquidity` has to be given.
   *
   * Best-effort: the deposit is already on chain, so a failed read costs the figure, not the
   * position.
   */
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

  /**
   * The id of a position this transaction minted, once it is confirmed.
   *
   * Best-effort, like the V2 follow-up read: the position exists on chain either way, so a log
   * that could not be read costs the caller the id, not the deposit.
   */
  /**
   * The id of the position a V4 mint created.
   *
   * It is assigned during execution, so nothing before the receipt can know it — and it is the one
   * figure a caller needs afterwards, since every later command names the position by it. On Nile
   * `position-list` cannot recover it either, so without this the only record of a new position is
   * a transaction log the caller would have to decode by hand. Measured on Nile: a V4 mint emits an
   * ERC-721 `Transfer` from the zero address, exactly as V3's does.
   */
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

    // The pool's own token order need not be the caller's, and the contract takes the amounts in
    // ITS order. Keep this internal plan in input order for amount/minimum payload binding;
    // addLiquidityV3 publishes position views in pool order.
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

    // A position of zero liquidity is not a small position, it is not a position: `mint` reverts
    // on it. It happens when the pool has no established price — the range collapses against the
    // tick bound and the amounts round to nothing — and it would otherwise surface as a bare
    // "REVERT opcode executed" from the estimate, which tells a reader nothing about what to fix.
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
      // A side the position takes none of needs no allowance.
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
        // V3 floors default to 0, not to a share of the amount.
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

  /**
   * Which of the two V3 scenarios this is, and everything that follows from it.
   *
   * An increase reads the pair, the tier and the range off the position. A mint takes them from
   * the caller, with defaults filled in when a value is omitted.
   */
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
    /** what the position already held, so a confirmed receipt can report what THIS call added. */
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
        // The position NFT already has a holder; an increase does not re-address it.
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
    // On V3 a caller's TRX becomes WTRX — the pools are wrapped. V2 is the protocol
    // where TRX stays native, and doing it silently is why help says so.
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

  /**
   * The position's price range.
   *
   * A tick the caller typed is CHECKED against the tier's grid, never rounded onto it: a range is
   * a price opinion, and moving a boundary by a spacing changes what the position earns. Only a
   * range the CLI chose is aligned, because there is no opinion to preserve.
   */
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

  /** The amounts as base units, or absent — V3 derives the missing side from the range. */
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

  /** V3 floors default to zero — the dry run warns when they are. */
  #v3Minimum(explicit: string | undefined, facts: TokenFacts): string {
    return explicit === undefined ? "0" : base(explicit, facts, "--min");
  }

  /**
   * A position belongs to the account that will sign, or the deposit is refused.
   *
   * `increaseLiquidity` does not check the caller — anyone may add to anyone's position — so a
   * mistyped id would hand someone else's position a deposit and the transaction would succeed.
   */
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

  /**
   * `mint` for a new position, `increaseLiquidity` for an existing one.
   *
   * The contract takes the amounts in the POOL's token order, which need not be the caller's, so
   * they are swapped back here rather than anywhere a reader would have to remember it.
   */
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

  /**
   * Which router call this deposit is.
   *
   * With native TRX on one side it is `addLiquidityETH`, and the TRX amount travels as the
   * call's VALUE. Passing it as an argument instead would build and broadcast a transaction that
   * deposits nothing, which is why the two are separate payloads rather than one with a flag.
   */
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
    // Resolved BEFORE the comparison: `--token0 TRX --token1 TRX` and a symbol paired with its
    // own address are the same pair, and only the addresses show that.
    const address0 = this.tokens.resolve(network, input.token0, RESOLVED);
    const address1 = this.tokens.resolve(network, input.token1, RESOLVED);
    if (address0 === address1) {
      throw new ChainError("same_token", "--token0 and --token1 are the same token");
    }
    const [token0, token1] = await Promise.all([
      this.#facts(network, address0),
      this.#facts(network, address1),
    ]);
    // A native-TRX deposit still goes into the WTRX pool — the router wraps it — so the pair is
    // looked up by the wrapped address while the receipt keeps naming TRX.
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
    // Native TRX is never approved: the router takes it as the call's value, so there is no
    // allowance for it to spend.
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
      // Omitted entirely when the allowances already suffice, so a reader is not shown an empty
      // list and left wondering whether an approval is coming.
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
    // With one side given the other comes from the pool's ratio — and an empty pool has no ratio,
    // so the first deposit into one has to name both sides itself.
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

  /** an explicit floor, else 95% of what is being deposited. */
  #minimum(explicit: string | undefined, amount: string, facts: TokenFacts): string {
    if (explicit === undefined) return applyMinimumShare(amount, DEFAULT_V2_MIN_BASIS_POINTS);
    return base(explicit, facts, "--min");
  }

  /**
   * What a token is. Read from its contract — except native TRX, which has none.
   *
   * TRX's six decimals are the chain's own definition of SUN, not a contract's answer, so they
   * are stated here rather than fetched from an address that would not respond.
   */
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

/**
 * A pool's key, as a request carries it.
 *
 * `parameters` VERBATIM from the pool. Re-encoding it from the tick spacing would be our guess at a
 * layout the pool has already told us, and a key that hashes to a different id names a different pool.
 */
/**
 * A V4 plan as it is PUBLISHED: without `amountMinimum` on either side.
 *
 * A V4 deposit is bounded from ABOVE (`amount0Max` / `amount1Max`) and has no floor at all. The
 * shared plan type carries a minimum because V2 and V3 genuinely need one when they send, so the
 * field stays required internally — but printing V4's placeholder `"0"` told an agent reading the
 * JSON that the deposit accepted any amount, when it is in fact capped. The ceiling is what
 * protects a V4 caller, and the output should say that rather than the opposite.
 */
function withoutV4Minimum<T extends { token0: object; token1: object }>(plan: T): T {
  const strip = (side: object): object => {
    const { amountMinimum: _dropped, ...rest } = side as { amountMinimum?: unknown };
    return rest;
  };
  return { ...plan, token0: strip(plan.token0), token1: strip(plan.token1) } as T;
}

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

/**
 * The receipt's view of a side.
 *
 * `decimals` travels with it for the same reason it does in the plan: it is what turns these
 * base units back into the amount a person deposited. A receipt that dropped it printed
 * "Deposited 1,000,000 USDT" for a 1 USDT deposit — the misread in the direction that alarms.
 */
/**
 * A V3 / V4 plan as a dry run or a build publishes it: the liquidity it funds is an ESTIMATE, so
 * it is `liquidityExpected`. `liquidity` belongs to the confirmed receipt, where it is
 * what the position measurably gained — one key for both would let a script read a plan as a
 * settlement.
 */
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

/** The pool's price is pinned at the edge of the representable range: it was initialised and has
 *  never traded, so there is no price to size a two-sided deposit against. */
function atPriceBound(pool: V3PoolState): boolean {
  return pool.exists && (pool.currentTick <= MIN_TICK || pool.currentTick >= MAX_TICK);
}

/** V3 pools are wrapped: a caller's TRX is WTRX here, unlike on V2. */
function wrapNative(contracts: LiquidityContractAddresses, address: string): string {
  return isNative(address) ? poolSideOf(contracts, address) : address;
}

function isNative(address: string): boolean {
  return address === NATIVE_TRX_ADDRESS;
}

/** The address the POOL is keyed by. Native TRX has no pool of its own; the router wraps it, so
 *  the pair to read is the WTRX one. */
function poolSideOf(contracts: LiquidityContractAddresses, address: string): string {
  return isNative(address) ? contracts.wtrx : address;
}

/**
 * A ceiling raised by a tolerance, in integer arithmetic.
 *
 * Only ever UP. `amount0Max` is a cap, so a tolerance that lowered it would revert every deposit
 * rather than protect anyone — which is the opposite of what `--min0` does on V2 and V3, and the
 * reason the two flags are not interchangeable.
 */
function raiseBy(amount: string, bips: number): string {
  if (bips === 0) return amount;
  return ((BigInt(amount) * BigInt(10_000 + bips)) / 10_000n).toString();
}

/** The chain id a Permit2 domain must be bound to, from the descriptor rather than the SDK. */
function v4ChainId(network: NetworkDescriptor): string {
  const id = (network as { chainId?: unknown }).chainId;
  if (typeof id === "string" && /^\d+$/.test(id)) return id;
  throw new ChainError(
    "provider_error",
    `network ${network.id} carries no numeric chain id, so a Permit2 domain cannot be checked against it`,
  );
}
