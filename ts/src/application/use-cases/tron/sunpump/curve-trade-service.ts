/**
 * SunPump curve trading — buying and selling on the bonding curve.
 *
 * Two directions of one market, and the asymmetries are the whole of the interesting part:
 *
 * - A BUY sends TRX as the call's value, so nothing is approved. A SELL has its tokens pulled, so
 *   the launchpad must be approved first — and for an UNBOUNDED amount, which is correct here and
 *   nowhere in the liquidity commands: the curve pulls on every sale and its contract is an
 *   upgradeable proxy that expects a standing allowance. The dry run says both of those out loud.
 * - The platform fee comes OUT of the TRX on both sides: deducted from what a buy spends, and from
 *   what a sale receives. It is 1% with a 0.01 TRX floor, so a small trade pays a rate far above
 *   1% — and that rate is reported, because it is the part a caller would not notice.
 * - Whether a trade is possible at all is a question about the curve's STATE, read from the
 *   contract before anything is quoted. Never from an HTTP status field: a stale "trading" sends a
 *   transaction that must revert.
 */
import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import type { TransactionScope } from "../../../contracts/execution-scope.js";
import type { TransactionModeInput } from "../../../contracts/transaction-input.js";
import type { ContractCallPayload } from "../../../contracts/tron-contract-call.js";
import type { LaunchpadPort, LaunchpadTokenFacts } from "../../../ports/sunpump/launchpad.js";
import type { ChainGatewayProvider } from "../../../ports/chain/gateway-provider.js";
import type { TxPipeline } from "../../../services/pipeline/index.js";
import {
  outcomeData,
  transactionMode,
  transactionRequiresSigner,
} from "../../../services/transaction-mode.js";
import { LiquidityTransactions, type ApprovalPlan } from "../sunswap/liquidity-transactions.js";
import { ChainError, UsageError } from "../../../../domain/errors/index.js";
import { toBaseUnits } from "../../../../domain/amounts/index.js";
import {
  bipsToSlippage,
  feeRatePercent,
  LAUNCHPAD_STATE,
  selectFloor,
  type LaunchpadState,
} from "../../../../domain/sunpump/curve.js";

export interface CurveTradeInput extends TransactionModeInput {
  /** the SunPump token's contract address. */
  readonly token: string;
  /** buy: TRX to spend, in whole TRX. sell: tokens to sell, in whole tokens. */
  readonly amount: string;
  readonly slippage?: string;
  readonly minOut?: string;
  /** read-only pricing: no account, no password, no transaction (PM 2.11). */
  readonly quote?: boolean;
  readonly feeLimit?: string;
}

interface TradeSide {
  readonly account?: string;
  readonly tokenAddress: string;
  readonly tokenSymbol: string;
  readonly tokenDecimals: number;
  readonly slippage?: string;
  /** SUN of platform fee, and the rate it worked out to when the floor pushed it above 1%. */
  readonly platformFee: string;
  readonly platformFeePercent?: string;
}

export class SunPumpCurveTradeService {
  private readonly tx: LiquidityTransactions;

  constructor(
    private readonly launchpad: LaunchpadPort,
    gateways: ChainGatewayProvider,
    pipeline: TxPipeline,
  ) {
    this.tx = new LiquidityTransactions(launchpad, gateways, pipeline);
  }

  async buy(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: CurveTradeInput,
  ): Promise<Record<string, unknown>> {
    const facts = await this.#tradeableToken(network, input.token);
    const trxSun = toBaseUnits(input.amount, 6, "TRX", "--trx");
    const quoted = await this.launchpad.quoteBuy(network, facts.address, trxSun);

    // A quote touches no account at all, so it is answered before anything asks for one — and it
    // publishes NO floor. `--quote` refuses --slippage, so any minimum here would be derived from
    // a default the caller never chose, and nothing would ever enforce it because a quote
    // produces no transaction. An agent reading it would believe it had protection it does not
    // have (PM 10.1.4). The scale stays, because it is what makes the estimate readable.
    if (input.quote) {
      return {
        kind: "sunpump-buy" as const,
        ...this.#side(facts, {}, quoted.feeSun, trxSun),
        trxIn: trxSun,
        mode: "quote",
        tokensOutExpected: quoted.tokenAmount,
      };
    }

    const floor = this.#floor(input, quoted.tokenAmount);
    const view = {
      kind: "sunpump-buy" as const,
      ...this.#side(facts, floor, quoted.feeSun, trxSun),
      trxIn: trxSun,
    };

    const owner = scope.resolveAddress("tron");
    await this.#assertNativeBalance(network, owner, trxSun);
    const payload = this.launchpad.buyPayload(network, {
      token: facts.address,
      trxSun,
      minTokenAmount: floor.amount,
    });

    return this.#execute(scope, network, input, payload, [], {
      ...view,
      account: owner,
      tokensOutExpected: quoted.tokenAmount,
      tokensOutMinimum: floor.amount,
    });
  }

  async sell(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: CurveTradeInput,
  ): Promise<Record<string, unknown>> {
    const facts = await this.#tradeableToken(network, input.token);
    const tokensIn = toBaseUnits(input.amount, facts.decimals, facts.symbol, "--amount");
    const quoted = await this.#quoteSell(network, facts, tokensIn);
    // The fee comes out of the proceeds, so what the caller receives is the difference — and the
    // floor is applied to that, not to the gross.
    const net = BigInt(quoted.trxAmountSun) - BigInt(quoted.feeSun);
    if (net <= 0n) {
      // Priceable, but the fee eats all of it. A different condition from the curve refusing to
      // price at all, and the same thing to do about it.
      await this.#refuseTooSmall(
        network,
        facts,
        tokensIn,
        `its ${quoted.trxAmountSun} SUN of proceeds would not cover the ${quoted.feeSun} SUN platform fee`,
      );
    }
    const netSun = net.toString();

    // No floor in quote mode, for the same reason as a buy: nothing would enforce it.
    if (input.quote) {
      return {
        kind: "sunpump-sell" as const,
        ...this.#side(facts, {}, quoted.feeSun, quoted.trxAmountSun),
        tokensIn,
        mode: "quote",
        trxOutExpected: netSun,
      };
    }

    const floor = this.#floor(input, netSun);
    const view = {
      kind: "sunpump-sell" as const,
      ...this.#side(facts, floor, quoted.feeSun, quoted.trxAmountSun),
      tokensIn,
    };

    const owner = scope.resolveAddress("tron");
    const held = await this.launchpad.balanceOf(network, facts.address, owner);
    if (BigInt(held) < BigInt(tokensIn)) {
      throw new ChainError(
        "insufficient_token_balance",
        `this sale needs ${tokensIn} of ${facts.symbol} in base units and the account holds ${held}`,
      );
    }

    const spender = this.launchpad.launchpadAddress(network);
    const approvals = await this.tx.planApprovals(network, owner, spender, [
      // Unbounded, and correct here: the curve pulls on every sale and its contract is an
      // upgradeable proxy that expects a standing allowance. The amount asked for is the amount
      // approved, so the plan reports `unlimited` rather than a number nobody would read.
      {
        facts: { address: facts.address, decimals: facts.decimals, symbol: facts.symbol },
        amount: UNLIMITED,
      },
    ]);
    const payload = this.launchpad.sellPayload(network, {
      token: facts.address,
      tokenAmount: tokensIn,
      minTrxSun: floor.amount,
    });

    return this.#execute(scope, network, input, payload, approvals, {
      ...view,
      account: owner,
      trxOutExpected: netSun,
      trxOutMinimum: floor.amount,
    });
  }

  /**
   * The sale's quote, and what a revert from it means.
   *
   * A sale can be too small in two distinct ways, both measured on a live mainnet curve: one
   * token reverts here, because the curve will not price it at all, while three hundred prices
   * and is then refused by the fee check above, because the proceeds are below the fee's floor.
   * Two conditions, one thing to do about either.
   */
  async #quoteSell(
    network: NetworkDescriptor,
    facts: LaunchpadTokenFacts,
    tokensIn: string,
  ): Promise<{ trxAmountSun: string; feeSun: string }> {
    try {
      return await this.launchpad.quoteSell(network, facts.address, tokensIn);
    } catch (error) {
      await this.#refuseTooSmall(network, facts, tokensIn, "the curve will not price it");
      throw error;
    }
  }

  /**
   * Both ways a sale can be too small, ending in the one thing a caller can act on.
   *
   * The threshold is READ, not assumed: the fee floor from the contract's own `minTxFee`, and the
   * token amount it corresponds to from the inverse quote — so it stays true if SunPump changes
   * the floor. And it is CHECKED before it is claimed: an amount that turns out not to be below
   * the threshold means the failure was something else, so the original error is left to speak
   * for itself rather than being relabelled.
   */
  async #refuseTooSmall(
    network: NetworkDescriptor,
    facts: LaunchpadTokenFacts,
    tokensIn: string,
    because: string,
  ): Promise<void> {
    const minimum = await this.launchpad
      .minimumSellAmount(network, facts.address)
      .catch(() => undefined);
    if (minimum === undefined || BigInt(tokensIn) >= BigInt(minimum)) return;
    throw new UsageError(
      "invalid_amount",
      `this sale is too small: ${because}. Sell at least ${minimum} ${facts.symbol} in base units`,
    );
  }

  /**
   * The state gate, before anything is quoted.
   *
   * Four states, and only one of them may trade. The two closed states are distinguished in the
   * message because the answer to each is different: one is waiting for a launch nobody can
   * hurry, the other has already moved to a market with its own command.
   */
  async #tradeableToken(network: NetworkDescriptor, token: string): Promise<LaunchpadTokenFacts> {
    const state = await this.launchpad.tokenState(network, token);
    assertTradeable(state, token);
    return this.launchpad.tokenFacts(network, token);
  }

  #side(
    facts: LaunchpadTokenFacts,
    floor: { slippage?: string },
    feeSun: string,
    trxSun: string,
  ): TradeSide {
    const percent = feeRatePercent(feeSun, trxSun);
    return {
      tokenAddress: facts.address,
      tokenSymbol: facts.symbol,
      tokenDecimals: facts.decimals,
      ...(floor.slippage === undefined ? {} : { slippage: floor.slippage }),
      platformFee: feeSun,
      ...(percent === undefined ? {} : { platformFeePercent: percent }),
    };
  }

  /**
   * The floor, from a tolerance or from an explicit amount.
   *
   * An explicit `--min-out` wins outright and reports no slippage, because a percentage the caller
   * did not give would be a number we invented.
   */
  #floor(input: CurveTradeInput, expected: string): { amount: string; slippage?: string } {
    const chosen = selectFloor(input.slippage, input.minOut);
    if (chosen.kind === "min-out") return { amount: chosen.amount };
    return {
      amount: this.launchpad.applyFloor(expected, chosen.bips),
      slippage: bipsToSlippage(chosen.bips),
    };
  }

  /**
   * The TRX a buy spends must be there before the fee is spent finding out.
   *
   * It does not account for the chain's own fee on top — that is what `--fee-limit` bounds, and
   * the estimate reports it separately.
   */
  async #assertNativeBalance(
    network: NetworkDescriptor,
    owner: string,
    trxSun: string,
  ): Promise<void> {
    const held = await this.launchpad.nativeBalance(network, owner);
    if (BigInt(held) < BigInt(trxSun)) {
      throw new ChainError(
        "insufficient_balance",
        `this buy spends ${trxSun} SUN and the account holds ${held}`,
      );
    }
  }

  async #execute(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: CurveTradeInput,
    payload: ContractCallPayload,
    approvals: readonly ApprovalPlan[],
    view: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const mode = transactionMode(input);
    if (transactionRequiresSigner(input)) this.tx.assertCanSign(scope);

    if (mode.dryRun) {
      const priced = await this.tx.priceWithoutSending(
        scope,
        network,
        approvals,
        payload,
        mode,
        input.feeLimit,
      );
      return {
        ...view,
        mode: "dry-run",
        ...(approvals.length === 0 ? {} : { approvals: approvals.map(published) }),
        ...priced,
      };
    }
    if (mode.buildOnly) {
      const built = await this.tx.buildOnly(
        scope,
        network,
        approvals,
        payload,
        mode,
        input.feeLimit,
      );
      return { ...view, ...built };
    }

    const owner = scope.resolveAddress("tron");
    const approvalTxIds = await this.tx.sendApprovals(
      scope,
      network,
      approvals,
      owner,
      mode,
      input.feeLimit,
    );
    const main = await this.tx.run(scope, network, payload, {
      mode,
      estimable: true,
      feeLimit: input.feeLimit,
    });
    return {
      ...view,
      ...(approvalTxIds.length === 0 ? {} : { approvalTxIds }),
      ...outcomeData(main),
    };
  }
}

/** 2^256-1: what an unbounded approval is. Correct on this path and on no liquidity path. */
const UNLIMITED = (2n ** 256n - 1n).toString();

/**
 * Only TRADING may trade.
 *
 * The two closed states get different messages because a reader needs a different thing from
 * each: READY_TO_LAUNCH is a wait, LAUNCHED is a redirect to the command that serves the market
 * the token moved to.
 */
function assertTradeable(state: LaunchpadState, token: string): void {
  if (state === LAUNCHPAD_STATE.TRADING) return;
  if (state === LAUNCHPAD_STATE.NOT_EXIST) {
    throw new ChainError(
      "launchpad_token_not_found",
      `${token} is not a SunPump token on this network`,
    );
  }
  if (state === LAUNCHPAD_STATE.READY_TO_LAUNCH) {
    throw new ChainError(
      "launchpad_trading_closed",
      `${token} has reached its threshold and is awaiting launch; the bonding curve is closed and no trade is possible until it launches`,
    );
  }
  throw new ChainError(
    "launchpad_trading_closed",
    `${token} has launched and left the bonding curve; trade it with \`sunswap swap\` instead`,
  );
}

/** The approval a plan will send, as a receipt publishes it — the amount named, not a number. */
function published(approval: ApprovalPlan): Record<string, unknown> {
  return {
    token: approval.token,
    spender: approval.spender,
    amount: approval.amount === UNLIMITED ? "unlimited" : approval.amount,
    decimals: approval.decimals,
    symbol: approval.symbol,
  };
}
