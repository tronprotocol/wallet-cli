import { requestDispatchCheck } from "../../services/command-deadline.js";
import type { ExecutionDeadline } from "../../contracts/deadline.js";
import { resolveTronAccount } from "../../services/tron/tron-account.js";
import type { NetworkDescriptor, TxOutcome } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { TransactionModeInput } from "../../contracts/transaction-input.js";
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
} from "../../ports/sunswap/liquidity.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import {
  outcomeData,
  transactionMode,
  transactionRequiresSigner,
} from "../../services/transaction-mode.js";
import { warnOnPostCheck } from "../../services/post-check.js";
import {
  tokenBookAccount,
  withTokenBook,
  type SunSwapTokenResolver,
} from "../../services/sunswap/sunswap-token-resolver.js";
import { ChainError, errorMessage, inputRef, UsageError } from "../../../domain/errors/index.js";
import { readPosition } from "./position-read.js";
import { toBaseUnits, type Sun, sunAmount, baseUnitAmount } from "../../../domain/amounts/index.js";
import {
  applyMinimumShare,
  DEFAULT_V2_MIN_BASIS_POINTS,
  lowerBySlippage,
  lpRedemption,
  resolveDeadline,
} from "../../../domain/sunswap/liquidity.js";
import { NATIVE_TRX_ADDRESS } from "../../../domain/sunswap/tokens.js";
import { describeHooks } from "../../../domain/sunswap/v4-pool.js";
import { slippageToBips } from "../../../domain/sunpump/curve.js";
import {
  LiquidityTransactions,
  outcomeTxId,
  withPositionManager,
  withZeroMinimumFlag,
  type ApprovalPlan,
} from "./liquidity-transactions.js";
import { FAMILIES } from "../../../domain/family/index.js";

const RESOLVED = { caller: "liquidity" } as const;

const KIND = "sunswap-remove-liquidity" as const;

export interface RemoveLiquidityInput extends TransactionModeInput {
  readonly protocol: string;
  // V2: whole LP tokens. V3/V4: unscaled position liquidity.
  readonly liquidity: string;
  readonly token0?: string;
  readonly token1?: string;
  readonly positionId?: string;
  readonly min0?: string;
  readonly min1?: string;
  readonly recipient?: string;
  readonly deadline?: number;
  readonly feeLimit?: Sun;
  // V4 fee-tier cross-check; the position selects the pool.
  readonly fee?: number;
  // V4 decimal tolerance that lowers the withdrawal floors.
  readonly slippage?: string;
}

export interface RemovalSide {
  readonly address: string;
  readonly symbol: string;
  readonly decimals: number;
  // Base units; estimated until settlement is available.
  readonly amount: string;
  // Minimum received, in base units.
  readonly amountMinimum: string;
  readonly acceptsAnyAmount?: true;
  // Base units reaching the recipient: principal plus any fees collected with it.
  readonly receivedAmount: string;
}

export interface RemovalPlanView {
  readonly account: string;
  readonly protocol: "V2" | "V3" | "V4";
  // Published as positionManager on V3/V4.
  readonly router: string;
  readonly recipient: string;
  readonly deadline: number;
  readonly token0: RemovalSide;
  readonly token1: RemovalSide;
  // V2 LP tokens burned, in base units.
  readonly lpAmount?: string;
  readonly lpDecimals?: number;
  // V3/V4 NFT id and unscaled liquidity to burn.
  readonly nftTokenId?: string;
  readonly liquidity?: string;
  readonly approvals?: readonly ApprovalPlan[];
  // 32-byte V4 pool id.
  readonly poolId?: string;
  readonly feeTier?: number;
  // V4 pool identity; independent of fee tier.
  readonly tickSpacing?: number;
  // "none" for an unhooked pool.
  readonly hooks?: string;
  readonly tickLower?: number;
  readonly tickUpper?: number;
  // V3/V4 withdrawals also collect the position's accrued fees.
  readonly collectsFees?: true;
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

  async #removeV2(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: RemoveLiquidityInput,
  ): Promise<Record<string, unknown>> {
    const owner = resolveTronAccount(scope);
    const { plan } = await this.#planV2(scope.deadline, network, owner, input);
    const mode = transactionMode(input);
    if (transactionRequiresSigner(input)) this.tx.assertCanSign(scope);

    const payload = this.#v2Payload(network, plan);
    if (mode.mode === "dry-run") {
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
    if (mode.mode === "build-only") {
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
    commandDeadline: ExecutionDeadline,
    network: NetworkDescriptor,
    owner: string,
    input: RemoveLiquidityInput,
  ): Promise<{ plan: RemovalPlanView; pair: V2PairState }> {
    const router = this.liquidity.contracts(network).v2Router;
    if (input.positionId !== undefined) {
      throw new UsageError(
        "invalid_option",
        errorMessage`${inputRef("positionId")} is not accepted on V2`,
      );
    }
    if (input.token0 === undefined || input.token1 === undefined) {
      throw new UsageError(
        "missing_option",
        errorMessage`V2 requires ${inputRef("token0")} and ${inputRef("token1")}`,
      );
    }
    const address0 = this.tokens.resolve(network, input.token0, RESOLVED);
    const address1 = this.tokens.resolve(network, input.token1, RESOLVED);
    if (address0 === address1) {
      throw new ChainError(
        "same_token",
        errorMessage`${inputRef("token0")} and ${inputRef("token1")} are the same token`,
      );
    }
    const [token0, token1] = await Promise.all([
      this.#facts(commandDeadline, network, address0),
      this.#facts(commandDeadline, network, address1),
    ]);
    const pair = await this.liquidity.v2PairState(
      network,
      poolSideOf(this.liquidity.contracts(network), token0.address),
      poolSideOf(this.liquidity.contracts(network), token1.address),
      requestDispatchCheck(commandDeadline),
    );
    if (!pair.exists || pair.totalSupply === "0") {
      throw new ChainError("pool_not_found", "no V2 pool exists for that pair");
    }

    const lpAmount = toBaseUnits(input.liquidity, pair.lpDecimals, "LP", inputRef("liquidity"));
    const held = await this.liquidity.balanceOf(
      network,
      pair.pairAddress,
      owner,
      requestDispatchCheck(commandDeadline),
    );
    if (BigInt(held) < BigInt(lpAmount)) {
      throw new ChainError(
        "insufficient_token_balance",
        `this withdrawal burns ${lpAmount} LP in base units and the account holds ${held}`,
      );
    }

    const amount0 = lpRedemption(lpAmount, pair.reserve0, pair.totalSupply);
    const amount1 = lpRedemption(lpAmount, pair.reserve1, pair.totalSupply);

    // The router burns LP tokens; approving the underlying pair tokens would not authorize it.
    const approvals = await this.tx.planApprovals(commandDeadline, network, owner, router, [
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

  #v2Minimum(explicit: string | undefined, amount: string, facts: TokenFacts): string {
    if (explicit === undefined) return applyMinimumShare(amount, DEFAULT_V2_MIN_BASIS_POINTS);
    return toBaseUnits(explicit, facts.decimals, facts.symbol, inputRef("min"));
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
        amountTokenMin: baseUnitAmount(native.token.amountMinimum),
        amountNativeMin: sunAmount(native.native.amountMinimum),
        recipient: plan.recipient,
        deadline: plan.deadline,
      });
    }
    return this.liquidity.v2RemoveLiquidityPayload(network, {
      token0: factsOf(plan.token0),
      token1: factsOf(plan.token1),
      liquidity: plan.lpAmount ?? "0",
      amount0Min: baseUnitAmount(plan.token0.amountMinimum),
      amount1Min: baseUnitAmount(plan.token1.amountMinimum),
      recipient: plan.recipient,
      deadline: plan.deadline,
    });
  }

  // Use the router result; account deltas also include fees and unrelated transfers.
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
        requestDispatchCheck(scope.deadline),
      );
      if (!actual) return "the router result could not be read; amounts remain estimates";
      Object.assign(settled, {
        token0: publishedSide(plan.token0, actual.amount0),
        token1: publishedSide(plan.token1, actual.amount1),
        amountsEstimated: false,
      });
      return undefined;
    });
    await warnOnPostCheck(scope, "sunswap_removal_reserves", async () => {
      const after = await this.liquidity.v2PairState(
        network,
        poolSideOf(this.liquidity.contracts(network), plan.token0.address),
        poolSideOf(this.liquidity.contracts(network), plan.token1.address),
        requestDispatchCheck(scope.deadline),
      );
      settled.reservesAfter = { token0: after.reserve0, token1: after.reserve1 };
      return undefined;
    });
    return settled;
  }

  async #removeV3(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: RemoveLiquidityInput,
  ): Promise<Record<string, unknown>> {
    const owner = resolveTronAccount(scope);
    const { plan, position } = await this.#planV3(scope.deadline, network, owner, input);
    const mode = transactionMode(input);
    if (transactionRequiresSigner(input)) this.tx.assertCanSign(scope);

    const payload = this.#v3Payload(network, plan);
    if (mode.mode === "dry-run") {
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
    if (mode.mode === "build-only") {
      const built = await this.tx.buildOnly(scope, network, [], payload, mode, input.feeLimit);
      return { kind: KIND, ...withPositionManager(plan), ...built };
    }

    // Ownership can change while the withdrawal is being prepared.
    await this.#assertPositionOwned(scope.deadline, network, position.tokenId, owner);
    // Read fees before collection combines them with principal.
    const owed = await this.#owedFees(scope, network, position.tokenId, plan.recipient, owner);

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
      collectsFees: true,
      token0: publishedSide(plan.token0),
      token1: publishedSide(plan.token1),
      ...outcomeData(main),
      amountsEstimated: true,
      ...settled,
    };
  }

  async #planV3(
    commandDeadline: ExecutionDeadline,
    network: NetworkDescriptor,
    owner: string,
    input: RemoveLiquidityInput,
  ): Promise<{ plan: RemovalPlanView; position: V3Position; pool: V3PoolState }> {
    const manager = this.liquidity.contracts(network).v3PositionManager;
    if (input.token0 !== undefined || input.token1 !== undefined) {
      throw new UsageError(
        "invalid_option",
        errorMessage`${inputRef("token0")} and ${inputRef("token1")} are not accepted on V3; the position already names the pair`,
      );
    }
    if (input.positionId === undefined) {
      throw new UsageError("missing_option", errorMessage`V3 requires ${inputRef("positionId")}`);
    }
    const position = await this.#assertPositionOwned(
      commandDeadline,
      network,
      input.positionId,
      owner,
    );

    const burn = wholeNumber(input.liquidity, "liquidity");
    if (BigInt(burn) > BigInt(position.liquidity)) {
      throw new UsageError(
        "invalid_amount",
        `position ${position.tokenId} holds ${position.liquidity} liquidity, less than the ${burn} this would burn`,
      );
    }

    const [token0, token1] = await Promise.all([
      this.#facts(commandDeadline, network, position.token0),
      this.#facts(commandDeadline, network, position.token1),
    ]);
    const pool = await this.liquidity.v3PoolState(
      network,
      position.token0,
      position.token1,
      position.fee,
      requestDispatchCheck(commandDeadline),
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
        token0: side(token0, expected.amount0, this.#v3Minimum(input.min0, token0)),
        token1: side(token1, expected.amount1, this.#v3Minimum(input.min1, token1)),
        collectsFees: true,
      },
      position,
      pool,
    };
  }

  #v3Minimum(explicit: string | undefined, facts: TokenFacts): string {
    return explicit === undefined
      ? "0"
      : toBaseUnits(explicit, facts.decimals, facts.symbol, inputRef("min"));
  }

  // V3 decreaseLiquidity only credits the position; the payload must also collect.
  #v3Payload(network: NetworkDescriptor, plan: RemovalPlanView): ContractCallPayload {
    return this.liquidity.v3RemovePayload(network, {
      tokenId: plan.nftTokenId ?? "0",
      liquidity: plan.liquidity ?? "0",
      amount0Min: baseUnitAmount(plan.token0.amountMinimum),
      amount1Min: baseUnitAmount(plan.token1.amountMinimum),
      recipient: plan.recipient,
      deadline: plan.deadline,
    });
  }

  // Unreadable fees must not block the withdrawal.
  async #owedFees(
    scope: TransactionScope,
    network: NetworkDescriptor,
    tokenId: string,
    recipient: string,
    owner: string,
  ): Promise<{ amount0: string; amount1: string } | undefined> {
    let owed: { amount0: string; amount1: string } | undefined;
    await warnOnPostCheck(scope, "sunswap_owed_fees", async () => {
      owed = await this.liquidity.v3OwedFees(
        network,
        tokenId,
        recipient,
        owner,
        requestDispatchCheck(scope.deadline),
      );
      return undefined;
    });
    return owed;
  }

  // Estimate the principal/fee split from the pre-send fees and the actual Collect total.
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
        this.liquidity.v3CollectedAmounts(
          network,
          txId,
          plan.nftTokenId!,
          requestDispatchCheck(scope.deadline),
        ),
        this.liquidity.v3Position(
          network,
          plan.nftTokenId ?? "0",
          requestDispatchCheck(scope.deadline),
        ),
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
    commandDeadline: ExecutionDeadline,
    network: NetworkDescriptor,
    tokenId: string,
    owner: string,
  ): Promise<V3Position> {
    const position = await readPosition("V3", tokenId, network, () =>
      this.liquidity.v3Position(network, tokenId, requestDispatchCheck(commandDeadline)),
    );
    if (position.owner !== owner) {
      throw new UsageError(
        "invalid_value",
        `position ${tokenId} is held by ${position.owner}, not by this account`,
      );
    }
    return position;
  }

  // V4 decreaseLiquidity settles principal and fees in one call; no separate collect is needed.
  async #removeV4(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: RemoveLiquidityInput,
  ): Promise<Record<string, unknown>> {
    const owner = resolveTronAccount(scope);
    const { plan, request } = await this.#planV4(scope.deadline, network, owner, input);
    const mode = transactionMode(input);
    if (transactionRequiresSigner(input)) this.tx.assertCanSign(scope);

    const payload = this.liquidity.v4RemovePayload(network, request);
    if (mode.mode === "dry-run") {
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
    if (mode.mode === "build-only") {
      const built = await this.tx.buildOnly(scope, network, [], payload, mode, input.feeLimit);
      return { kind: KIND, ...withPositionManager(plan), ...built };
    }

    // Ownership can change while the withdrawal is being prepared.
    await this.#assertV4PositionOwned(scope.deadline, network, request.tokenId, owner);
    // Withdrawal pays accrued fees too; read them before the call clears them.
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
      token0: publishedSide(plan.token0, plan.token0.amount, owed?.amount0),
      token1: publishedSide(plan.token1, plan.token1.amount, owed?.amount1),
      ...outcomeData(main),
      amountsEstimated: true,
      ...settled,
    };
  }

  async #planV4(
    commandDeadline: ExecutionDeadline,
    network: NetworkDescriptor,
    owner: string,
    input: RemoveLiquidityInput,
  ): Promise<{ plan: RemovalPlanView; position: V4Position; request: V4RemoveRequest }> {
    if (input.recipient !== undefined) {
      throw new UsageError(
        "invalid_option",
        errorMessage`${inputRef("recipient")} is not accepted on V4; the tokens always go to the signing account`,
      );
    }
    if (input.positionId === undefined) {
      throw new UsageError("missing_option", errorMessage`V4 requires ${inputRef("positionId")}`);
    }
    if (input.token0 === undefined || input.token1 === undefined) {
      throw new UsageError(
        "missing_option",
        errorMessage`V4 requires ${inputRef("token0")} and ${inputRef("token1")} as well as ${inputRef("positionId")}; the pair is checked against the position`,
      );
    }

    const position = await this.#assertV4PositionOwned(
      commandDeadline,
      network,
      input.positionId,
      owner,
    );
    this.#assertPairMatches(network, position, input.token0, input.token1);
    if (input.fee !== undefined && input.fee !== position.fee) {
      throw new UsageError(
        "invalid_value",
        errorMessage`${inputRef("fee")} ${input.fee} does not match position ${position.tokenId}, which is in a ${position.fee} tier pool`,
      );
    }

    const burn = wholeNumber(input.liquidity, "liquidity");
    if (BigInt(burn) > BigInt(position.liquidity)) {
      throw new UsageError(
        "invalid_amount",
        `position ${position.tokenId} holds ${position.liquidity} liquidity, less than the ${burn} this would burn`,
      );
    }

    const pool = await this.liquidity.v4PoolState(
      network,
      position.poolId,
      requestDispatchCheck(commandDeadline),
    );
    if (!pool.exists) {
      throw new ChainError(
        "pool_not_found",
        `no V4 pool with id ${position.poolId} has been initialised on this network`,
      );
    }

    const [token0, token1] = await Promise.all([
      this.#facts(commandDeadline, network, pool.currency0),
      this.#facts(commandDeadline, network, pool.currency1),
    ]);
    const range = { tickLower: position.tickLower, tickUpper: position.tickUpper };
    // Round withdrawals down so minimums do not exceed the expected receipts.
    const expected = this.liquidity.v4AmountsForLiquidity(pool, range, burn);

    const amount0Min = this.#v4Minimum(input.min0, input.slippage, expected.amount0, token0);
    const amount1Min = this.#v4Minimum(input.min1, input.slippage, expected.amount1, token1);

    const deadline = resolveDeadline(input.deadline, Date.now());
    const key = {
      currency0: pool.currency0,
      currency1: pool.currency1,
      hooks: pool.hooks,
      fee: pool.fee,
      // Preserve parameters verbatim; changing any bit changes the pool identity.
      parameters: pool.parameters,
    };

    return {
      plan: {
        account: owner,
        protocol: "V4",
        router: this.liquidity.v4PositionManager(network),
        recipient: owner,
        deadline,
        nftTokenId: position.tokenId,
        liquidity: burn,
        token0: side(token0, expected.amount0, amount0Min),
        token1: side(token1, expected.amount1, amount1Min),
        poolId: pool.poolId,
        feeTier: pool.fee,
        tickSpacing: pool.tickSpacing,
        hooks: describeHooks(pool.hooks),
        tickLower: range.tickLower,
        tickUpper: range.tickUpper,
        collectsFees: true,
      },
      position,
      request: {
        pool: key,
        tokenId: position.tokenId,
        liquidity: burn,
        amount0Min: baseUnitAmount(amount0Min),
        amount1Min: baseUnitAmount(amount1Min),
        recipient: owner,
        deadline,
      },
    };
  }

  #v4Minimum(
    explicit: string | undefined,
    slippage: string | undefined,
    expected: string,
    facts: TokenFacts,
  ): string {
    // Slippage lowers the explicit floor, or the estimate when no floor was supplied.
    const base =
      explicit === undefined
        ? expected
        : toBaseUnits(explicit, facts.decimals, facts.symbol, inputRef("min"));
    if (slippage === undefined) return explicit === undefined ? "0" : base;
    return lowerBySlippage(base, slippageToBips(slippage));
  }

  // Require currency order so min0/min1 protect the intended assets.
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
    const matches = given[0] === held[0] && given[1] === held[1];
    if (!matches) {
      throw new UsageError(
        "invalid_value",
        errorMessage`${inputRef("token0")} ${given[0]} and ${inputRef("token1")} ${given[1]} do not match position ${position.tokenId}'s currency order; use ${inputRef("token0")} ${held[0]} ${inputRef("token1")} ${held[1]} and set ${inputRef("min0")} / ${inputRef("min1")} for the corresponding assets`,
      );
    }
  }

  // Unreadable fees omit the estimate without blocking withdrawal.
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
      owed = await this.liquidity.v4OwedFees(
        network,
        {
          tokenId: nftTokenId,
          poolId,
          tickLower,
          tickUpper,
        },
        requestDispatchCheck(scope.deadline),
      );
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
        const actual = await this.liquidity.v4LiquidityResult(
          network,
          txId,
          {
            poolId: plan.poolId!,
            tokenId: plan.nftTokenId!,
            account: plan.recipient,
            token0: plan.token0.address,
            token1: plan.token1.address,
          },
          requestDispatchCheck(scope.deadline),
        );
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
      const after = await this.liquidity.v4Position(
        network,
        plan.nftTokenId ?? "0",
        requestDispatchCheck(scope.deadline),
      );
      settled = { ...settled, liquidityAfter: after.liquidity };
      return undefined;
    });
    return settled;
  }

  async #assertV4PositionOwned(
    commandDeadline: ExecutionDeadline,
    network: NetworkDescriptor,
    tokenId: string,
    owner: string,
  ): Promise<V4Position> {
    const position = await readPosition("V4", tokenId, network, () =>
      this.liquidity.v4Position(network, tokenId, requestDispatchCheck(commandDeadline)),
    );
    if (position.owner !== owner) {
      throw new UsageError(
        "invalid_value",
        `position ${tokenId} is held by ${position.owner}, not by this account`,
      );
    }
    return position;
  }

  async #facts(
    deadline: ExecutionDeadline,
    network: NetworkDescriptor,
    address: string,
  ): Promise<TokenFacts> {
    if (isNative(address))
      return { address, decimals: FAMILIES.tron.nativeDecimals, symbol: "TRX" };
    return this.liquidity.tokenFacts(network, address, requestDispatchCheck(deadline));
  }
}

function side(facts: TokenFacts, amount: string, amountMinimum: string): RemovalSide {
  return withZeroMinimumFlag({
    address: facts.address,
    symbol: facts.symbol,
    decimals: facts.decimals,
    amount,
    amountMinimum,
    receivedAmount: amount,
  });
}

function factsOf(entry: RemovalSide): TokenFacts {
  return { address: entry.address, decimals: entry.decimals, symbol: entry.symbol };
}

function publishedSide(
  entry: RemovalSide,
  amount: string = entry.amount,
  feeAmount?: string,
): Record<string, unknown> {
  return {
    address: entry.address,
    symbol: entry.symbol,
    decimals: entry.decimals,
    amount,
    ...(feeAmount === undefined ? {} : { feeAmount }),
    receivedAmount: (BigInt(amount) + BigInt(feeAmount ?? "0")).toString(),
  };
}

function splitSide(
  entry: RemovalSide,
  collected: string,
  owed: string | undefined,
): Record<string, unknown> {
  if (owed === undefined) return publishedSide(entry, collected);
  const fees = BigInt(owed) > BigInt(collected) ? BigInt(collected) : BigInt(owed);
  return publishedSide(entry, (BigInt(collected) - fees).toString(), fees.toString());
}

function wholeNumber(value: string, field: string): string {
  if (!/^\d+$/.test(value.trim()) || BigInt(value.trim()) === 0n) {
    throw new UsageError(
      "invalid_amount",
      errorMessage`${inputRef(field)} must be a whole number of liquidity units greater than zero`,
    );
  }
  return value.trim();
}

function isNative(address: string): boolean {
  return address === NATIVE_TRX_ADDRESS;
}

// V2 pools hold WTRX; the router wraps native TRX.
function poolSideOf(contracts: LiquidityContractAddresses, address: string): string {
  return isNative(address) ? contracts.wtrx : address;
}
