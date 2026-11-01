import { requestDispatchCheck } from "../../services/command-deadline.js";
import type { ExecutionDeadline } from "../../contracts/deadline.js";
import { activeTronAccount, resolveTronAccount } from "../../services/tron/tron-account.js";
import { tradeOutput } from "../../services/trade-output.js";
import { NATIVE_TRX_ADDRESS } from "../../../domain/sunswap/tokens.js";
import { quoteCurveSale } from "./curve-sale.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { TransactionModeInput } from "../../contracts/transaction-input.js";
import type { ContractCallPayload } from "../../contracts/tron/tron-contract-call.js";
import type { LaunchpadPort, LaunchpadTokenFacts } from "../../ports/sunpump/launchpad.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import {
  outcomeData,
  transactionMode,
  transactionRequiresSigner,
} from "../../services/transaction-mode.js";
import { LiquidityTransactions, type ApprovalPlan } from "../sunswap/liquidity-transactions.js";
import { UNLIMITED_ALLOWANCE } from "../../../domain/token/allowance.js";
import { ChainError, errorMessage, followUp, inputRef } from "../../../domain/errors/index.js";
import { toBaseUnits, type Sun, sunAmount, baseUnitAmount } from "../../../domain/amounts/index.js";
import {
  bipsToSlippage,
  feeRatePercent,
  LAUNCHPAD_STATE,
  MIN_PLATFORM_FEE_SUN,
  selectFloor,
  type LaunchpadState,
} from "../../../domain/sunpump/curve.js";
import { FAMILIES } from "../../../domain/family/index.js";

export interface CurveTradeInput extends TransactionModeInput {
  readonly token: string;
  // Buy: decimal TRX; sell: decimal token amount.
  readonly amount: string;
  readonly slippage?: string;
  readonly minOut?: string;
  // Read-only pricing without an account or transaction.
  readonly quote?: boolean;
  readonly feeLimit?: Sun;
}

interface TradeSide {
  readonly account?: string;
  readonly tokenAddress: string;
  readonly tokenSymbol: string;
  readonly tokenDecimals: number;
  readonly slippage?: string;
  // Platform fee in SUN.
  readonly platformFee: string;
  readonly platformFeePercent?: string;
  // Fee floor in SUN; published with platformFeePercent, which it explains.
  readonly platformFeeMinimum?: string;
}

export class SunPumpCurveTradeService {
  private readonly tx: LiquidityTransactions;

  constructor(
    private readonly launchpad: LaunchpadPort,
    private readonly gateways: ChainGatewayProvider,
    pipeline: TxPipeline,
  ) {
    this.tx = new LiquidityTransactions(launchpad, gateways, pipeline);
  }

  async buy(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: CurveTradeInput,
  ): Promise<Record<string, unknown>> {
    if (!input.quote) resolveTronAccount(scope);
    const facts = await this.#tradeableToken(scope.deadline, network, input.token);
    const trxSun = sunAmount(
      toBaseUnits(input.amount, FAMILIES.tron.nativeDecimals, "TRX", inputRef("trx")),
    );
    const quoted = await this.launchpad.quoteBuy(
      network,
      facts.address,
      trxSun,
      requestDispatchCheck(scope.deadline),
    );

    // Quotes require no account and publish no unenforceable minimum output.
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

    const owner = resolveTronAccount(scope);
    await this.#assertNativeBalance(scope.deadline, network, owner, trxSun);
    const payload = this.launchpad.buyPayload(network, {
      token: facts.address,
      trxSun,
      minTokenAmount: baseUnitAmount(floor.amount),
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
    if (!input.quote) resolveTronAccount(scope);
    const facts = await this.#tradeableToken(scope.deadline, network, input.token);
    const tokensIn = baseUnitAmount(
      toBaseUnits(input.amount, facts.decimals, facts.symbol, inputRef("amount")),
    );
    // Sale proceeds are net; add the fee only to calculate the gross fee rate.
    const quoted = await quoteCurveSale(scope.deadline, this.launchpad, network, facts, tokensIn);
    const netSun = quoted.trxOutSun;
    const grossSun = (BigInt(netSun) + BigInt(quoted.feeSun)).toString();

    // Quotes publish no unenforceable minimum output.
    if (input.quote) {
      return {
        kind: "sunpump-sell" as const,
        ...this.#side(facts, {}, quoted.feeSun, grossSun),
        tokensIn,
        mode: "quote",
        trxOutExpected: netSun,
      };
    }

    const floor = this.#floor(input, netSun);
    const view = {
      kind: "sunpump-sell" as const,
      ...this.#side(facts, floor, quoted.feeSun, grossSun),
      tokensIn,
    };

    const owner = resolveTronAccount(scope);
    await activeTronAccount(scope.deadline, this.gateways, network, owner);
    const held = await this.launchpad.balanceOf(
      network,
      facts.address,
      owner,
      requestDispatchCheck(scope.deadline),
    );
    if (BigInt(held) < BigInt(tokensIn)) {
      throw new ChainError(
        "insufficient_token_balance",
        `this sale needs ${tokensIn} of ${facts.symbol} in base units and the account holds ${held}`,
      );
    }

    const spender = this.launchpad.launchpadAddress(network);
    const approvals = await this.tx.planApprovals(scope.deadline, network, owner, spender, [
      // Sales request a standing unlimited allowance for the launchpad proxy.
      {
        facts: { address: facts.address, decimals: facts.decimals, symbol: facts.symbol },
        amount: UNLIMITED_ALLOWANCE,
      },
    ]);
    const payload = this.launchpad.sellPayload(network, {
      token: facts.address,
      tokenAmount: tokensIn,
      minTrxSun: sunAmount(floor.amount),
    });

    return this.#execute(scope, network, input, payload, approvals, {
      ...view,
      account: owner,
      trxOutExpected: netSun,
      trxOutMinimum: floor.amount,
    });
  }

  // Read contract state before quoting; catalogue status may be stale.
  async #tradeableToken(
    deadline: ExecutionDeadline,
    network: NetworkDescriptor,
    token: string,
  ): Promise<LaunchpadTokenFacts> {
    const state = await this.launchpad.tokenState(network, token, requestDispatchCheck(deadline));
    assertTradeable(state, token);
    return this.launchpad.tokenFacts(network, token, requestDispatchCheck(deadline));
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
      ...(percent === undefined
        ? {}
        : { platformFeePercent: percent, platformFeeMinimum: MIN_PLATFORM_FEE_SUN }),
    };
  }

  #floor(input: CurveTradeInput, expected: string): { amount: string; slippage?: string } {
    const chosen = selectFloor(input.slippage, input.minOut);
    if (chosen.kind === "min-out") return { amount: chosen.amount };
    return {
      amount: this.launchpad.applyFloor(expected, chosen.bips),
      slippage: bipsToSlippage(chosen.bips),
    };
  }

  // Check the trade value only; chain fees are estimated separately.
  async #assertNativeBalance(
    deadline: ExecutionDeadline,
    network: NetworkDescriptor,
    owner: string,
    trxSun: string,
  ): Promise<void> {
    const account = await activeTronAccount(deadline, this.gateways, network, owner);
    const held = String(account.balance ?? "0");
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

    if (mode.mode === "dry-run") {
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
    if (mode.mode === "build-only") {
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

    const owner = resolveTronAccount(scope);
    return this.tx.withApprovals(
      scope,
      network,
      approvals,
      owner,
      mode,
      input.feeLimit,
      async (approvalTxIds) => {
        const main = await this.tx.run(scope, network, payload, {
          mode,
          estimable: true,
          feeLimit: input.feeLimit,
        });
        return {
          ...view,
          ...(approvalTxIds.length === 0 ? {} : { approvalTxIds }),
          ...outcomeData(main),
          ...(await tradeOutput(
            scope,
            network,
            this.gateways,
            main,
            view.kind === "sunpump-buy" ? input.token : NATIVE_TRX_ADDRESS,
            owner,
            view.kind === "sunpump-buy" ? "tokensOut" : "trxOut",
          )),
        };
      },
    );
  }
}

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
    errorMessage`${token} has launched and left the bonding curve; trade it with \`${followUp("sunswap-swap")}\` instead`,
  );
}

function published(approval: ApprovalPlan): Record<string, unknown> {
  return {
    token: approval.token,
    spender: approval.spender,
    amount: approval.isUnlimited ? "unlimited" : approval.amount,
    isUnlimited: approval.isUnlimited,
    decimals: approval.decimals,
    symbol: approval.symbol,
  };
}
