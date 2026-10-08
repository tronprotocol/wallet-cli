import { resolveTronAccount } from "../../../services/tron-account.js";
/**
 * SunSwap remove-liquidity — taking a position back out.
 *
 * The mirror of adding, and not symmetric with it:
 *
 * - V2 burns LP tokens and the ROUTER must be allowed to take them, so the approval is for the
 *   LP token itself rather than for the pair's two sides.
 * - V3 needs no approval at all: the position manager already holds the NFT.
 * - V3 is ONE transaction carrying a multicall of `decreaseLiquidity` + `collect`.
 *   `decreaseLiquidity` alone only credits the position and transfers nothing, so a user who
 *   sent it would see a successful transaction and receive no tokens (PM 6.2.1).
 * - V4 is ONE call and not a multicall, unlike V3: `decreaseLiquidity` settles the pair itself,
 *   so nothing has to be collected beside it. It also needs no approval and no Permit2 — the
 *   position manager already holds the position, so nothing needs authorising to move.
 * - `--liquidity` means two different things. On V2 it is LP tokens, in whole units, like any
 *   other token amount. On V3 and V4 it is the position's internal liquidity, which is not a
 *   token amount at all and has no decimals. Getting that wrong is silent, which is why help
 *   says so.
 *
 * ONE RULE GOVERNS THE V4 PATH and it is the opposite of the V4 DEPOSIT's: a withdrawal is
 * bounded from BELOW, by `amount0Min` / `amount1Min`, where the deposit is bounded from above by
 * a ceiling. So every estimate here must err DOWNWARD — understating what arrives is safe,
 * overstating it is not — which is why the sizing goes through `v4AmountsForLiquidity` (rounds
 * down) and never through the deposit's ceiling helper.
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
  V4Position,
  V4RemoveRequest,
} from "../../../ports/sunswap/liquidity.js";
import type { ChainGatewayProvider } from "../../../ports/chain/gateway-provider.js";
import type { TxPipeline } from "../../../services/pipeline/index.js";
import {
  outcomeData,
  transactionMode,
  transactionRequiresSigner,
} from "../../../services/transaction-mode.js";
import { warnOnPostCheck } from "../../../services/post-check.js";
import {
  tokenBookAccount,
  withTokenBook,
  type SunSwapTokenResolver,
} from "../../../services/sunswap-token-resolver.js";
import { ChainError, UsageError } from "../../../../domain/errors/index.js";
import { readPosition } from "./position-read.js";
import { toBaseUnits } from "../../../../domain/amounts/index.js";
import {
  applyMinimumShare,
  DEFAULT_V2_MIN_BASIS_POINTS,
  resolveDeadline,
} from "../../../../domain/sunswap/liquidity.js";
import { NATIVE_TRX_ADDRESS } from "../../../../domain/sunswap/tokens.js";
import { describeHooks } from "../../../../domain/sunswap/v4-pool.js";
import { slippageToBips } from "../../../../domain/sunpump/curve.js";
import {
  LiquidityTransactions,
  outcomeTxId,
  withPositionManager,
  type ApprovalPlan,
} from "./liquidity-transactions.js";

/**
 * The lookup for the resolution further in. The entry has already resolved `token0`/`token1`
 * against the account's book, so what reaches these calls is an address (a pass-through) or a
 * builtin; a caller that skipped the entry gets the official layer only.
 */
const RESOLVED = { caller: "liquidity" } as const;

/** The receipt's `kind`, one value across every mode this command has (PM 2.9). */
const KIND = "sunswap-remove-liquidity" as const;

export interface RemoveLiquidityInput extends TransactionModeInput {
  readonly protocol: string;
  /**
   * V2: LP tokens to burn, in whole units. V3: the position's internal liquidity, raw — not a
   * token amount, and not scaled by anything.
   */
  readonly liquidity: string;
  readonly token0?: string;
  readonly token1?: string;
  readonly positionId?: string;
  readonly min0?: string;
  readonly min1?: string;
  readonly recipient?: string;
  readonly deadline?: number;
  readonly feeLimit?: string;
  /**
   * V4: the pool's fee tier, as a CROSS-CHECK against the tier the position reports.
   *
   * Never a selector — the position names its own pool — so the only thing it can do is disagree,
   * and a disagreement is refused rather than resolved in either direction.
   */
  readonly fee?: number;
  /**
   * V4: a further DOWNWARD tolerance on the computed floors, as a decimal.
   *
   * It only ever lowers them. `amount0Min` is a floor, so a tolerance that raised it would revert
   * the withdrawals it was meant to protect — the exact opposite of what `--slippage` does on the
   * V4 deposit, where the bound is a ceiling and the tolerance only ever raises it.
   */
  readonly slippage?: string;
}

export interface RemovalSide {
  readonly address: string;
  readonly symbol: string;
  readonly decimals: number;
  /** base units expected back, before the transaction; actual afterwards. */
  readonly amount: string;
  /** base units below which the withdrawal should revert rather than proceed. */
  readonly amountMinimum: string;
}

export interface RemovalPlanView {
  readonly account: string;
  readonly protocol: "V2" | "V3" | "V4";
  /** V2's router, or the V3 / V4 position manager — published as `positionManager` on V3 / V4. */
  readonly router: string;
  readonly recipient: string;
  readonly deadline: number;
  readonly token0: RemovalSide;
  readonly token1: RemovalSide;
  /** V2: LP tokens burned, base units. */
  readonly lpAmount?: string;
  readonly lpDecimals?: number;
  /** V3: the position and how much of its liquidity this burns. */
  readonly nftTokenId?: string;
  readonly liquidity?: string;
  readonly approvals?: readonly ApprovalPlan[];
  // ── V4 ──────────────────────────────────────────────────────────────────────
  /** the 32-byte pool id. A V4 pool has no address, so this is what names it. */
  readonly poolId?: string;
  readonly feeTier?: number;
  /** part of the pool's identity on V4, rather than implied by the fee tier. */
  readonly tickSpacing?: number;
  /** already the WORD for it — "none" for an unhooked pool — never the zero address. */
  readonly hooks?: string;
  readonly tickLower?: number;
  readonly tickUpper?: number;
}

export class SunSwapRemoveLiquidityService {
  private readonly tx: LiquidityTransactions;

  constructor(
    private readonly liquidity: LiquidityPort,
    gateways: ChainGatewayProvider,
    pipeline: TxPipeline,
    private readonly tokens: SunSwapTokenResolver,
  ) {
    this.tx = new LiquidityTransactions(liquidity, gateways, pipeline);
  }

  async removeLiquidity(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: RemoveLiquidityInput,
  ): Promise<Record<string, unknown>> {
    const book = this.tokens.resolvePair(network, input, {
      caller: "liquidity",
      account: tokenBookAccount(scope),
    });
    const resolved = book.input;
    const protocol = resolved.protocol.toUpperCase();
    const result =
      protocol === "V4"
        ? await this.#removeV4(scope, network, resolved)
        : protocol === "V3"
          ? await this.#removeV3(scope, network, resolved)
          : await this.#removeV2(scope, network, resolved);
    return withTokenBook(result, book.resolved);
  }

  // ── V2 ──────────────────────────────────────────────────────────────────────

  async #removeV2(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: RemoveLiquidityInput,
  ): Promise<Record<string, unknown>> {
    const owner = resolveTronAccount(scope);
    const { plan } = await this.#planV2(network, owner, input);
    const mode = transactionMode(input);
    if (transactionRequiresSigner(input)) this.tx.assertCanSign(scope);

    const payload = this.#v2Payload(network, plan);
    if (mode.dryRun) {
      const priced = await this.tx.priceWithoutSending(
        scope,
        network,
        plan.approvals ?? [],
        payload,
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
        payload,
        mode,
        input.feeLimit,
      );
      return { kind: KIND, ...plan, ...built };
    }

    return this.tx.withApprovals(
      scope,
      network,
      plan.approvals ?? [],
      owner,
      mode,
      input.feeLimit,
      async (approvalTxIds) => {
        const main = await this.tx.run(scope, network, payload, {
          mode,
          estimable: true,
          feeLimit: input.feeLimit,
        });
        const settled = await this.#settleV2(scope, network, plan, main);

        return {
          kind: KIND,
          account: plan.account,
          protocol: plan.protocol,
          router: plan.router,
          recipient: plan.recipient,
          lpAmount: plan.lpAmount,
          // decimals travels with the amount. Without it the receipt printed "LP burned 766,634"
          // for the same burn the dry run had shown as a fraction — a live Nile run caught it, and
          // it is the third time this shape of defect has appeared on this path.
          lpDecimals: plan.lpDecimals,
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

  async #planV2(
    network: NetworkDescriptor,
    owner: string,
    input: RemoveLiquidityInput,
  ): Promise<{ plan: RemovalPlanView; pair: V2PairState }> {
    const router = this.liquidity.contracts(network).v2Router;
    if (input.positionId !== undefined) {
      throw new UsageError("invalid_option", "--position-id is not accepted on V2");
    }
    if (input.token0 === undefined || input.token1 === undefined) {
      throw new UsageError("missing_option", "V2 requires --token0 and --token1");
    }
    const address0 = this.tokens.resolve(network, input.token0, RESOLVED);
    const address1 = this.tokens.resolve(network, input.token1, RESOLVED);
    if (address0 === address1) {
      throw new ChainError("same_token", "--token0 and --token1 are the same token");
    }
    const [token0, token1] = await Promise.all([
      this.#facts(network, address0),
      this.#facts(network, address1),
    ]);
    const pair = await this.liquidity.v2PairState(
      network,
      poolSideOf(this.liquidity.contracts(network), token0.address),
      poolSideOf(this.liquidity.contracts(network), token1.address),
    );
    if (!pair.exists || pair.totalSupply === "0") {
      throw new ChainError("pool_not_found", "no V2 pool exists for that pair");
    }

    // LP tokens are an ordinary TRC20, so the amount is scaled by the pair's own decimals.
    const lpAmount = toBaseUnits(input.liquidity, pair.lpDecimals, "LP", "--liquidity");
    const held = await this.liquidity.balanceOf(network, pair.pairAddress, owner);
    if (BigInt(held) < BigInt(lpAmount)) {
      throw new ChainError(
        "insufficient_token_balance",
        `this withdrawal burns ${lpAmount} LP in base units and the account holds ${held}`,
      );
    }

    // Each side comes back in proportion to the share of the supply being burned.
    const amount0 = share(lpAmount, pair.reserve0, pair.totalSupply);
    const amount1 = share(lpAmount, pair.reserve1, pair.totalSupply);

    // The LP TOKEN is what the router must be allowed to take — not the pair's two sides, which
    // the pool already holds (PM 13.3).
    const approvals = await this.tx.planApprovals(network, owner, router, [
      {
        facts: { address: pair.pairAddress, decimals: pair.lpDecimals, symbol: "LP" },
        amount: lpAmount,
      },
    ]);

    return {
      plan: {
        account: owner,
        protocol: "V2",
        router,
        recipient: input.recipient ?? owner,
        deadline: resolveDeadline(input.deadline, Date.now()),
        lpAmount,
        lpDecimals: pair.lpDecimals,
        token0: side(token0, amount0, this.#v2Minimum(input.min0, amount0, token0)),
        token1: side(token1, amount1, this.#v2Minimum(input.min1, amount1, token1)),
        ...(approvals.length === 0 ? {} : { approvals }),
      },
      pair,
    };
  }

  /** an explicit floor, else 95% of what the current reserves say is coming back (PM 6.2.3). */
  #v2Minimum(explicit: string | undefined, amount: string, facts: TokenFacts): string {
    if (explicit === undefined) return applyMinimumShare(amount, DEFAULT_V2_MIN_BASIS_POINTS);
    return toBaseUnits(explicit, facts.decimals, facts.symbol, "--min");
  }

  #v2Payload(network: NetworkDescriptor, plan: RemovalPlanView): ContractCallPayload {
    const native = isNative(plan.token0.address)
      ? { native: plan.token0, token: plan.token1 }
      : isNative(plan.token1.address)
        ? { native: plan.token1, token: plan.token0 }
        : undefined;
    if (native) {
      return this.liquidity.v2RemoveLiquidityEthPayload(network, {
        token: factsOf(native.token),
        liquidity: plan.lpAmount ?? "0",
        amountTokenMin: native.token.amountMinimum,
        amountNativeMin: native.native.amountMinimum,
        recipient: plan.recipient,
        deadline: plan.deadline,
      });
    }
    return this.liquidity.v2RemoveLiquidityPayload(network, {
      token0: factsOf(plan.token0),
      token1: factsOf(plan.token1),
      liquidity: plan.lpAmount ?? "0",
      amount0Min: plan.token0.amountMinimum,
      amount1Min: plan.token1.amountMinimum,
      recipient: plan.recipient,
      deadline: plan.deadline,
    });
  }

  /** Read this transaction's router result; account deltas also include fees and other transfers. */
  async #settleV2(
    scope: TransactionScope,
    network: NetworkDescriptor,
    plan: RemovalPlanView,
    outcome: TxOutcome,
  ): Promise<Record<string, unknown>> {
    if (outcome.stage !== "confirmed") return {};
    const txId = outcomeTxId(outcome);
    if (!txId) return {};
    const settled: Record<string, unknown> = {};
    await warnOnPostCheck(scope, "sunswap_removal_postread", async () => {
      const actual = await this.liquidity.v2LiquidityResult(
        network,
        txId,
        "remove",
        isNative(plan.token0.address),
      );
      if (!actual) return "the router result could not be read; amounts remain estimates";
      Object.assign(settled, {
        token0: { ...publishedSide(plan.token0), amount: actual.amount0 },
        token1: { ...publishedSide(plan.token1), amount: actual.amount1 },
        amountsEstimated: false,
      });
      return undefined;
    });
    await warnOnPostCheck(scope, "sunswap_removal_reserves", async () => {
      const after = await this.liquidity.v2PairState(
        network,
        poolSideOf(this.liquidity.contracts(network), plan.token0.address),
        poolSideOf(this.liquidity.contracts(network), plan.token1.address),
      );
      settled.reservesAfter = { token0: after.reserve0, token1: after.reserve1 };
      return undefined;
    });
    return settled;
  }

  // ── V3 ──────────────────────────────────────────────────────────────────────

  async #removeV3(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: RemoveLiquidityInput,
  ): Promise<Record<string, unknown>> {
    const owner = resolveTronAccount(scope);
    const { plan, position } = await this.#planV3(network, owner, input);
    const mode = transactionMode(input);
    if (transactionRequiresSigner(input)) this.tx.assertCanSign(scope);

    const payload = this.#v3Payload(network, plan);
    if (mode.dryRun) {
      const priced = await this.tx.priceWithoutSending(
        scope,
        network,
        [],
        payload,
        mode,
        input.feeLimit,
      );
      return { kind: KIND, mode: "dry-run", ...withPositionManager(plan), ...priced };
    }
    if (mode.buildOnly) {
      const built = await this.tx.buildOnly(scope, network, [], payload, mode, input.feeLimit);
      return { kind: KIND, ...withPositionManager(plan), ...built };
    }

    // Re-read the owner immediately before sending: a dry run can be minutes old, and a position
    // that changed hands in between must not be decreased on this account's behalf.
    await this.#assertPositionOwned(network, position.tokenId, owner);
    // What the position could collect BEFORE the transaction. Afterwards the principal and the
    // fees have arrived together and nothing distinguishes them (PM 6.2.4).
    const owed = await this.#owedFees(scope, network, position.tokenId, plan.recipient);

    const main = await this.tx.run(scope, network, payload, {
      mode,
      estimable: true,
      feeLimit: input.feeLimit,
    });
    const settled = await this.#settleV3(scope, network, plan, owed, main);

    return {
      kind: KIND,
      account: plan.account,
      protocol: plan.protocol,
      positionManager: plan.router,
      nftTokenId: plan.nftTokenId,
      liquidity: plan.liquidity,
      recipient: plan.recipient,
      token0: publishedSide(plan.token0),
      token1: publishedSide(plan.token1),
      ...outcomeData(main),
      amountsEstimated: true,
      ...settled,
    };
  }

  async #planV3(
    network: NetworkDescriptor,
    owner: string,
    input: RemoveLiquidityInput,
  ): Promise<{ plan: RemovalPlanView; position: V3Position; pool: V3PoolState }> {
    const manager = this.liquidity.contracts(network).v3PositionManager;
    if (input.token0 !== undefined || input.token1 !== undefined) {
      throw new UsageError(
        "invalid_option",
        "--token0 and --token1 are not accepted on V3; the position already names the pair",
      );
    }
    if (input.positionId === undefined) {
      throw new UsageError("missing_option", "V3 requires --position-id");
    }
    const position = await this.#assertPositionOwned(network, input.positionId, owner);

    // Raw, not scaled: a position's liquidity is not a token amount and has no decimals.
    const burn = wholeNumber(input.liquidity, "--liquidity");
    if (BigInt(burn) > BigInt(position.liquidity)) {
      throw new UsageError(
        "invalid_amount",
        `position ${position.tokenId} holds ${position.liquidity} liquidity, less than the ${burn} this would burn`,
      );
    }

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
    const expected = this.liquidity.v3AmountsForLiquidity(
      pool,
      { tickLower: position.tickLower, tickUpper: position.tickUpper },
      burn,
    );

    return {
      plan: {
        account: owner,
        protocol: "V3",
        router: manager,
        recipient: input.recipient ?? owner,
        deadline: resolveDeadline(input.deadline, Date.now()),
        nftTokenId: position.tokenId,
        liquidity: burn,
        // V3 floors default to 0 (PM 6.2.3). The dry run says so out loud.
        token0: side(token0, expected.amount0, this.#v3Minimum(input.min0, token0)),
        token1: side(token1, expected.amount1, this.#v3Minimum(input.min1, token1)),
      },
      position,
      pool,
    };
  }

  #v3Minimum(explicit: string | undefined, facts: TokenFacts): string {
    return explicit === undefined
      ? "0"
      : toBaseUnits(explicit, facts.decimals, facts.symbol, "--min");
  }

  #v3Payload(network: NetworkDescriptor, plan: RemovalPlanView): ContractCallPayload {
    return this.liquidity.v3RemovePayload(network, {
      tokenId: plan.nftTokenId ?? "0",
      liquidity: plan.liquidity ?? "0",
      amount0Min: plan.token0.amountMinimum,
      amount1Min: plan.token1.amountMinimum,
      recipient: plan.recipient,
      deadline: plan.deadline,
    });
  }

  /** Best-effort: an unreadable fee figure costs the split, not the withdrawal. */
  async #owedFees(
    scope: TransactionScope,
    network: NetworkDescriptor,
    tokenId: string,
    recipient: string,
  ): Promise<{ amount0: string; amount1: string } | undefined> {
    let owed: { amount0: string; amount1: string } | undefined;
    await warnOnPostCheck(scope, "sunswap_owed_fees", async () => {
      owed = await this.liquidity.v3OwedFees(network, tokenId, recipient);
      return undefined;
    });
    return owed;
  }

  /**
   * What arrived, split into principal and the fees collected alongside it (PM 6.2.4).
   *
   * One transaction brings both, so nothing in the receipt distinguishes them: the split is what
   * the `Collect` event reports minus what the position was owed beforehand. Text shows the
   * total; only JSON separates them, because the total is what a person is checking.
   */
  async #settleV3(
    scope: TransactionScope,
    network: NetworkDescriptor,
    plan: RemovalPlanView,
    owed: { amount0: string; amount1: string } | undefined,
    outcome: TxOutcome,
  ): Promise<Record<string, unknown>> {
    if (outcome.stage !== "confirmed") return {};
    const txId = outcomeTxId(outcome);
    if (txId === undefined) return {};
    let settled: Record<string, unknown> = {};
    await warnOnPostCheck(scope, "sunswap_removal_postread", async () => {
      const [collected, after] = await Promise.all([
        this.liquidity.v3CollectedAmounts(network, txId),
        this.liquidity.v3Position(network, plan.nftTokenId ?? "0"),
      ]);
      if (!collected) {
        return "the removal confirmed but its Collect event could not be read, so the receipt reports the expected amounts rather than the actual ones";
      }
      settled = {
        amountsEstimated: false,
        token0: splitSide(plan.token0, collected.amount0, owed?.amount0),
        token1: splitSide(plan.token1, collected.amount1, owed?.amount1),
        liquidityAfter: after.liquidity,
      };
      return undefined;
    });
    return settled;
  }

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

  // ── V4 ──────────────────────────────────────────────────────────────────────

  /**
   * A V4 withdrawal.
   *
   * ONE call, not V3's multicall: `decreaseLiquidity` on the V4 position manager settles the pair
   * itself, so there is no `collect` beside it and nothing to approve. What is left to get right is
   * the DIRECTION of the bound — see the note at the top of this file.
   */
  async #removeV4(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: RemoveLiquidityInput,
  ): Promise<Record<string, unknown>> {
    const owner = resolveTronAccount(scope);
    const { plan, request } = await this.#planV4(network, owner, input);
    const mode = transactionMode(input);
    if (transactionRequiresSigner(input)) this.tx.assertCanSign(scope);

    const payload = this.liquidity.v4RemovePayload(network, request);
    if (mode.dryRun) {
      const priced = await this.tx.priceWithoutSending(
        scope,
        network,
        [],
        payload,
        mode,
        input.feeLimit,
      );
      return { kind: KIND, mode: "dry-run", ...withPositionManager(plan), ...priced };
    }
    if (mode.buildOnly) {
      const built = await this.tx.buildOnly(scope, network, [], payload, mode, input.feeLimit);
      return { kind: KIND, ...withPositionManager(plan), ...built };
    }

    // Re-read the owner immediately before sending, for the same reason V3 does: a dry run can be
    // minutes old, and a position that changed hands in between must not be decreased on this
    // account's behalf.
    await this.#assertV4PositionOwned(network, request.tokenId, owner);
    /**
     * What the position is owed BEFORE the call, because the call takes it too.
     *
     * MEASURED on Nile, 2026-09-25, position 7: owed 4821 TRX / 3132 USDT before a partial
     * withdrawal, 0 / 0 after, while an untouched position's owed figure stood unchanged. So a V4
     * withdrawal settles the fees alongside the principal exactly as V3's does. PM 6.2 says the
     * opposite — that V4 leaves them for `collect-fees` — and reporting only the principal, as an
     * earlier version did, understated what arrived by nearly four times and left a caller looking
     * for money that had already been paid to them.
     */
    const owed = await this.#owedFeesV4(scope, network, plan);

    const main = await this.tx.run(scope, network, payload, {
      mode,
      estimable: true,
      feeLimit: input.feeLimit,
    });
    const settled = await this.#settleV4(scope, network, plan, main);

    return {
      kind: KIND,
      ...withPositionManager(plan),
      token0: withFees(publishedSide(plan.token0), owed?.amount0),
      token1: withFees(publishedSide(plan.token1), owed?.amount1),
      ...outcomeData(main),
      amountsEstimated: true,
      ...settled,
    };
  }

  /**
   * Everything a V4 withdrawal needs, decided before anything is sent.
   *
   * V4 requires BOTH the position id AND the pair, unlike V3 — and the pair is not what selects the
   * pool. The position names its own pool; the caller's pair is a CROSS-CHECK against what the
   * position reports, so that withdrawing from a position the caller did not mean to is refused
   * rather than executed. The fee tier, when given, is checked the same way.
   */
  async #planV4(
    network: NetworkDescriptor,
    owner: string,
    input: RemoveLiquidityInput,
  ): Promise<{ plan: RemovalPlanView; position: V4Position; request: V4RemoveRequest }> {
    // Defensive: the command schema refuses this at parse time, where it is deterministic and needs
    // no wallet. Restated here because the use case is also reachable directly, and a recipient
    // silently dropped is a withdrawal sent somewhere the caller did not ask for.
    if (input.recipient !== undefined) {
      throw new UsageError(
        "invalid_option",
        "--recipient is not accepted on V4; the tokens always go to the signing account",
      );
    }
    if (input.positionId === undefined) {
      throw new UsageError("missing_option", "V4 requires --position-id");
    }
    if (input.token0 === undefined || input.token1 === undefined) {
      throw new UsageError(
        "missing_option",
        "V4 requires --token0 and --token1 as well as --position-id; the pair is checked against the position",
      );
    }

    const position = await this.#assertV4PositionOwned(network, input.positionId, owner);
    this.#assertPairMatches(network, position, input.token0, input.token1);
    if (input.fee !== undefined && input.fee !== position.fee) {
      throw new UsageError(
        "invalid_value",
        `--fee ${input.fee} does not match position ${position.tokenId}, which is in a ${position.fee} tier pool`,
      );
    }

    // Raw, not scaled: a position's liquidity is not a token amount and has no decimals.
    const burn = wholeNumber(input.liquidity, "--liquidity");
    if (BigInt(burn) > BigInt(position.liquidity)) {
      throw new UsageError(
        "invalid_amount",
        `position ${position.tokenId} holds ${position.liquidity} liquidity, less than the ${burn} this would burn`,
      );
    }

    const pool = await this.liquidity.v4PoolState(network, position.poolId);
    if (!pool.exists) {
      throw new ChainError(
        "pool_not_found",
        `no V4 pool with id ${position.poolId} has been initialised on this network`,
      );
    }

    const [token0, token1] = await Promise.all([
      this.#facts(network, pool.currency0),
      this.#facts(network, pool.currency1),
    ]);
    const range = { tickLower: position.tickLower, tickUpper: position.tickUpper };
    // ROUNDS DOWN — this is what the caller RECEIVES, so the error must point down. The deposit's
    // ceiling helper rounds the other way and is deliberately not used here.
    const expected = this.liquidity.v4AmountsForLiquidity(pool, range, burn);

    const amount0Min = this.#v4Minimum(input.min0, input.slippage, expected.amount0, token0);
    const amount1Min = this.#v4Minimum(input.min1, input.slippage, expected.amount1, token1);

    const deadline = resolveDeadline(input.deadline, Date.now());
    const key = {
      currency0: pool.currency0,
      currency1: pool.currency1,
      hooks: pool.hooks,
      fee: pool.fee,
      // The pool's OWN word, never re-encoded from the spacing — re-encoding it would be our guess
      // at a layout the pool has already told us.
      parameters: pool.parameters,
    };

    return {
      plan: {
        account: owner,
        protocol: "V4",
        router: this.liquidity.v4PositionManager(network),
        // Always the signing account: `--recipient` is refused on this path.
        recipient: owner,
        deadline,
        nftTokenId: position.tokenId,
        liquidity: burn,
        token0: side(token0, expected.amount0, amount0Min),
        token1: side(token1, expected.amount1, amount1Min),
        poolId: pool.poolId,
        feeTier: pool.fee,
        tickSpacing: pool.tickSpacing,
        // The word for it, never the zero address — which on TRON is also native TRX's address, so
        // printing it would say the pool is hooked to TRX.
        hooks: describeHooks(pool.hooks),
        tickLower: range.tickLower,
        tickUpper: range.tickUpper,
      },
      position,
      request: {
        pool: key,
        tokenId: position.tokenId,
        liquidity: burn,
        amount0Min,
        amount1Min,
        recipient: owner,
        deadline,
      },
    };
  }

  /**
   * The FLOOR on one side: an explicit amount, a tolerance below the estimate, or zero.
   *
   * Zero is PM's default on V3 and V4 alike. A tolerance only ever LOWERS the floor, because a floor
   * raised above what the position is worth reverts the withdrawal it was meant to protect — the
   * opposite direction to `--slippage` on the V4 deposit, where the bound is a ceiling.
   */
  #v4Minimum(
    explicit: string | undefined,
    slippage: string | undefined,
    expected: string,
    facts: TokenFacts,
  ): string {
    // PM 6.2.3 defines --slippage as a tolerance that lowers --min0/--min1 FURTHER, so the two
    // combine rather than compete: the explicit amount is the base when one is given, and the
    // estimate is the base when none is. Either way the tolerance only ever moves the floor DOWN,
    // which is the safe direction for a withdrawal — the bound protects against receiving less.
    const base =
      explicit === undefined
        ? expected
        : toBaseUnits(explicit, facts.decimals, facts.symbol, "--min");
    if (slippage === undefined) return explicit === undefined ? "0" : base;
    return applyMinimumShare(base, BigInt(10_000 - slippageToBips(slippage)));
  }

  /**
   * The caller's pair against the position's own, as a set.
   *
   * Unordered on purpose: V4's currency order is the key's, not the caller's, and a caller who wrote
   * the two sides the other way round has named the same pool. What this exists to catch is a caller
   * withdrawing from a position they did not mean to, and that is caught either way round.
   */
  #assertPairMatches(
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
    const matches =
      (given[0] === held[0] && given[1] === held[1]) ||
      (given[0] === held[1] && given[1] === held[0]);
    if (!matches) {
      throw new UsageError(
        "invalid_value",
        `--token0 ${given[0]} and --token1 ${given[1]} are not the pair position ${position.tokenId} holds, which is ${held[0]} and ${held[1]}`,
      );
    }
  }

  /**
   * What the position holds after the withdrawal — read, not computed.
   *
   * Best-effort, like every other post-check here: the tokens are already the caller's, so a failed
   * follow-up read costs the figure and not the withdrawal. The AMOUNTS stay as planned: V4 emits no
   * event this codebase can decode into what arrived, so the receipt reports the estimate rather
   * than inventing an actual.
   */
  /**
   * The fees the withdrawal will also pay out, read just before it is sent.
   *
   * Best effort on purpose: a figure we could not read must not stop a withdrawal the caller asked
   * for. When it is missing the receipt simply carries no `feeAmount`, which is the same shape V3
   * falls back to.
   */
  async #owedFeesV4(
    scope: TransactionScope,
    network: NetworkDescriptor,
    plan: RemovalPlanView,
  ): Promise<{ amount0: string; amount1: string } | undefined> {
    const { nftTokenId, poolId, tickLower, tickUpper } = plan;
    if (
      nftTokenId === undefined ||
      poolId === undefined ||
      tickLower === undefined ||
      tickUpper === undefined
    ) {
      return undefined;
    }
    let owed: { amount0: string; amount1: string } | undefined;
    await warnOnPostCheck(scope, "sunswap_v4_owed_fees_unavailable", async () => {
      owed = await this.liquidity.v4OwedFees(network, {
        tokenId: nftTokenId,
        poolId,
        tickLower,
        tickUpper,
      });
      return undefined;
    });
    return owed;
  }

  async #settleV4(
    scope: TransactionScope,
    network: NetworkDescriptor,
    plan: RemovalPlanView,
    outcome: TxOutcome,
  ): Promise<Record<string, unknown>> {
    if (outcome.stage !== "confirmed") return {};
    let settled: Record<string, unknown> = {};
    const txId = outcomeTxId(outcome);
    if (txId !== undefined) {
      await warnOnPostCheck(scope, "sunswap_removal_amounts", async () => {
        const actual = await this.liquidity.v4LiquidityResult(network, txId, {
          poolId: plan.poolId!,
          tokenId: plan.nftTokenId!,
          account: plan.recipient,
          token0: plan.token0.address,
          token1: plan.token1.address,
        });
        if (!actual)
          return "the withdrawal confirmed but its actual amounts could not be read; amounts remain estimates";
        settled = {
          token0: {
            ...publishedSide(plan.token0),
            amount: actual.principal0,
            feeAmount: actual.fee0,
            receivedAmount: actual.balanceDelta0,
          },
          token1: {
            ...publishedSide(plan.token1),
            amount: actual.principal1,
            feeAmount: actual.fee1,
            receivedAmount: actual.balanceDelta1,
          },
          liquidity: (-BigInt(actual.liquidityDelta)).toString(),
          amountsEstimated: false,
        };
        return undefined;
      });
    }
    await warnOnPostCheck(scope, "sunswap_removal_postread", async () => {
      const after = await this.liquidity.v4Position(network, plan.nftTokenId ?? "0");
      settled = { ...settled, liquidityAfter: after.liquidity };
      return undefined;
    });
    return settled;
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

  async #facts(network: NetworkDescriptor, address: string): Promise<TokenFacts> {
    if (isNative(address)) return { address, decimals: 6, symbol: "TRX" };
    return this.liquidity.tokenFacts(network, address);
  }
}

function side(facts: TokenFacts, amount: string, amountMinimum: string): RemovalSide {
  return {
    address: facts.address,
    symbol: facts.symbol,
    decimals: facts.decimals,
    amount,
    amountMinimum,
  };
}

function factsOf(entry: RemovalSide): TokenFacts {
  return { address: entry.address, decimals: entry.decimals, symbol: entry.symbol };
}

function publishedSide(entry: RemovalSide): Record<string, unknown> {
  return {
    address: entry.address,
    symbol: entry.symbol,
    decimals: entry.decimals,
    amount: entry.amount,
  };
}

/**
 * One side of a confirmed V3 removal: principal, and the fees that came with it.
 *
 * `feeAmount` is what the position was owed before the transaction; the principal is the rest.
 * When the owed figure could not be read the whole arrival is reported as `amount` rather than
 * guessed at — a split invented from nothing would be worse than no split.
 */
/**
 * A published side plus the fees that arrived with it, when we know them.
 *
 * Unlike V3's `splitSide` there is nothing to subtract: V4 emits no event this codebase decodes, so
 * `amount` is the principal the plan computed and `feeAmount` is what the position was owed. The fee
 * figure is a LOWER BOUND — the pool can accrue more between the read and the block — and that is
 * the honest direction for a number describing money that arrived.
 */
function withFees(
  side: Record<string, unknown>,
  owed: string | undefined,
): Record<string, unknown> {
  return owed === undefined ? side : { ...side, feeAmount: owed };
}

function splitSide(
  entry: RemovalSide,
  collected: string,
  owed: string | undefined,
): Record<string, unknown> {
  if (owed === undefined) return { ...publishedSide(entry), amount: collected };
  const fees = BigInt(owed) > BigInt(collected) ? BigInt(collected) : BigInt(owed);
  return {
    ...publishedSide(entry),
    amount: (BigInt(collected) - fees).toString(),
    feeAmount: fees.toString(),
  };
}

/** `amount * reserve / totalSupply` — the share of a reserve that a burn is worth. */
function share(amount: string, reserve: string, totalSupply: string): string {
  return ((BigInt(amount) * BigInt(reserve)) / BigInt(totalSupply)).toString();
}

function wholeNumber(value: string, flag: string): string {
  if (!/^\d+$/.test(value.trim()) || BigInt(value.trim()) === 0n) {
    throw new UsageError(
      "invalid_amount",
      `${flag} must be a whole number of liquidity units greater than zero`,
    );
  }
  return value.trim();
}

function isNative(address: string): boolean {
  return address === NATIVE_TRX_ADDRESS;
}

/** Native TRX has no pool of its own; the router wraps it, so the pair to read is the WTRX one. */
function poolSideOf(contracts: LiquidityContractAddresses, address: string): string {
  return isNative(address) ? contracts.wtrx : address;
}
