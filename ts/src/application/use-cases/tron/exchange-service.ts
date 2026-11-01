import { requestDispatchCheck } from "../../services/command-deadline.js";
import type { ExecutionDeadline } from "../../contracts/deadline.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { ChainError, errorMessage, inputRef, UsageError } from "../../../domain/errors/index.js";
import { assertPositive, isPositive, toBaseUnits } from "../../../domain/amounts/index.js";
import {
  TRX_TOKEN_ID,
  bancorOutput,
  normalizeTokenId,
  proportionalOther,
  slippageFloor,
  splitPair,
  tokenIdLabel,
} from "../../../domain/tron/exchange/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronExchange, TronGateway } from "../../ports/chain/tron/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import {
  outcomeData,
  receiptOf,
  transactionMode,
  transactionRequiresSigner,
  type TransactionModeInput,
} from "../../services/transaction-mode.js";
import { tronConfirmation } from "../../services/tron/tron-confirmation.js";
import { tronTransactionHooks } from "./multisig-authorization.js";
import { FAMILIES } from "../../../domain/family/index.js";

const TRX_DECIMALS = FAMILIES.tron.nativeDecimals;
// The protocol requires expected > 0, even without slippage protection.
const UNPROTECTED_FLOOR = 1n;

interface TokenMeta {
  tokenId: string;
  decimals: number;
  label: string;
}

interface AmountInput {
  amount?: string;
  rawAmount?: string;
}
export interface ExchangeCreateInput extends TransactionModeInput {
  pair: string;
  amounts?: string;
  rawAmounts?: string;
}
export interface ExchangeLiquidityInput extends TransactionModeInput, AmountInput {
  id: number;
  token: string;
}
export interface ExchangeTradeInput extends TransactionModeInput, AmountInput {
  id: number;
  sell: string;
  minReceived?: string;
  rawMinReceived?: string;
  slippage?: number;
}
export interface ExchangeShowInput {
  id: number;
}
export interface ExchangeListInput {
  limit: number;
  offset: number;
}

export class TronExchangeService {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly pipeline: TxPipeline,
  ) {}

  async show(deadline: ExecutionDeadline, network: NetworkDescriptor, input: ExchangeShowInput) {
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(deadline));
    const exchange = await this.#requireExchange(gateway, input.id);
    const [first, second] = await Promise.all([
      this.#tokenMeta(gateway, exchange.firstTokenId),
      this.#tokenMeta(gateway, exchange.secondTokenId),
    ]);
    return {
      kind: "exchange-show" as const,
      exchangeId: exchange.exchangeId,
      pair: `${tokenIdLabel(exchange.firstTokenId)}:${tokenIdLabel(exchange.secondTokenId)}`,
      creatorAddress: exchange.creatorAddress,
      createTime: exchange.createTime,
      firstTokenId: exchange.firstTokenId,
      firstTokenBalance: exchange.firstTokenBalance,
      firstTokenLabel: first.label,
      firstTokenDecimals: first.decimals,
      secondTokenId: exchange.secondTokenId,
      secondTokenBalance: exchange.secondTokenBalance,
      secondTokenLabel: second.label,
      secondTokenDecimals: second.decimals,
    };
  }

  // Avoid per-row token lookups when listing exchanges.
  async list(deadline: ExecutionDeadline, network: NetworkDescriptor, input: ExchangeListInput) {
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(deadline));
    const exchanges = await gateway.listExchanges(input.limit, input.offset);
    return {
      kind: "exchange-list" as const,
      exchanges: exchanges.map((e) => ({
        exchangeId: e.exchangeId,
        pair: `${tokenIdLabel(e.firstTokenId)}:${tokenIdLabel(e.secondTokenId)}`,
        creatorAddress: e.creatorAddress,
        firstTokenId: e.firstTokenId,
        firstTokenBalance: e.firstTokenBalance,
        secondTokenId: e.secondTokenId,
        secondTokenBalance: e.secondTokenBalance,
      })),
      pagination: { offset: input.offset, limit: input.limit },
    };
  }

  async create(scope: TransactionScope, network: NetworkDescriptor, input: ExchangeCreateInput) {
    if (transactionRequiresSigner(input)) this.pipeline.assertCanSign(scope.activeAccount, "tron");
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline));
    const owner = scope.resolveAddress("tron");

    const [rawFirst, rawSecond] = splitPair(input.pair, inputRef("pair"));
    const firstTokenId = normalizeTokenId(rawFirst);
    const secondTokenId = normalizeTokenId(rawSecond);
    if (firstTokenId === secondTokenId) {
      throw new ChainError("same_token", "the two sides of a pair must be different tokens");
    }
    const [first, second] = await Promise.all([
      this.#tokenMeta(gateway, firstTokenId),
      this.#tokenMeta(gateway, secondTokenId),
    ]);
    const [firstAmount, secondAmount] = await this.#pairAmounts(input, first, second);

    const outcome = await this.pipeline.runTron({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      ...tronTransactionHooks(gateway),
      preflight: null,
      confirm: tronConfirmation(gateway, scope),
      build: (from) =>
        gateway.buildExchangeCreate(
          from,
          firstTokenId,
          String(firstAmount),
          secondTokenId,
          String(secondAmount),
        ),
      estimate: async () => ({
        feeModel: "tron-resource",
        note: "creation burns the chain's exchange create fee",
      }),
    });
    const data = outcomeData(outcome);
    return {
      kind: "exchange-create" as const,
      ...data,
      // The chain assigns the exchange ID on confirmation.
      ...(receiptOf(data).exchangeId === undefined
        ? {}
        : { exchangeId: Number(receiptOf(data).exchangeId) }),
      pair: `${tokenIdLabel(firstTokenId)}:${tokenIdLabel(secondTokenId)}`,
      creatorAddress: owner,
      firstTokenId,
      firstTokenQuant: String(firstAmount),
      firstTokenLabel: first.label,
      firstTokenDecimals: first.decimals,
      secondTokenId,
      secondTokenQuant: String(secondAmount),
      secondTokenLabel: second.label,
      secondTokenDecimals: second.decimals,
    };
  }

  async inject(scope: TransactionScope, network: NetworkDescriptor, input: ExchangeLiquidityInput) {
    return this.#liquidity(scope, network, input, "inject");
  }

  async withdraw(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: ExchangeLiquidityInput,
  ) {
    return this.#liquidity(scope, network, input, "withdraw");
  }

  async trade(scope: TransactionScope, network: NetworkDescriptor, input: ExchangeTradeInput) {
    if (transactionRequiresSigner(input)) this.pipeline.assertCanSign(scope.activeAccount, "tron");
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline));
    const owner = scope.resolveAddress("tron");
    const exchange = await this.#requireExchange(gateway, input.id);
    const sellTokenId = normalizeTokenId(input.sell);
    const sides = this.#sides(exchange, sellTokenId);
    const [sellMeta, buyMeta] = await Promise.all([
      this.#tokenMeta(gateway, sides.tokenId),
      this.#tokenMeta(gateway, sides.otherTokenId),
    ]);
    const sellQuant = this.#amount(input, sellMeta);

    // Approximate output drives the preview and slippage-floor validation.
    const predicted = bancorOutput(sides.reserve, sides.otherReserve, sellQuant);
    const floor = this.#tradeFloor(scope, input, predicted, buyMeta);

    const outcome = await this.pipeline.runTron({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      ...tronTransactionHooks(gateway),
      preflight: null,
      confirm: tronConfirmation(gateway, scope),
      build: (from) =>
        gateway.buildExchangeTrade(
          from,
          exchange.exchangeId,
          sides.tokenId,
          String(sellQuant),
          String(floor),
        ),
      estimate: async () => ({
        feeModel: "tron-resource",
        note: "a trade uses bandwidth only — the protocol takes no fee",
      }),
    });
    const data = outcomeData(outcome);
    return {
      kind: "exchange-trade" as const,
      ...data,
      exchangeId: exchange.exchangeId,
      pair: `${tokenIdLabel(exchange.firstTokenId)}:${tokenIdLabel(exchange.secondTokenId)}`,
      traderAddress: owner,
      soldTokenId: sides.tokenId,
      soldQuant: String(sellQuant),
      soldLabel: sellMeta.label,
      soldDecimals: sellMeta.decimals,
      receivedTokenId: sides.otherTokenId,
      receivedLabel: buyMeta.label,
      receivedDecimals: buyMeta.decimals,
      // Report actual received quantities only from the receipt.
      ...(receiptOf(data).exchangeReceived === undefined
        ? {}
        : { receivedQuant: String(receiptOf(data).exchangeReceived) }),
      estimatedReceivedQuant: String(predicted),
      minReceivedQuant: String(floor),
    };
  }

  async #liquidity(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: ExchangeLiquidityInput,
    action: "inject" | "withdraw",
  ) {
    if (transactionRequiresSigner(input)) this.pipeline.assertCanSign(scope.activeAccount, "tron");
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline));
    const owner = scope.resolveAddress("tron");
    const exchange = await this.#requireExchange(gateway, input.id);
    if (exchange.creatorAddress !== owner) {
      throw new ChainError(
        "not_exchange_creator",
        "only the account that created this pair can add or remove its liquidity, and that binding cannot be moved",
      );
    }
    const tokenId = normalizeTokenId(input.token);
    const sides = this.#sides(exchange, tokenId);
    const [meta, otherMeta] = await Promise.all([
      this.#tokenMeta(gateway, sides.tokenId),
      this.#tokenMeta(gateway, sides.otherTokenId),
    ]);
    const quant = this.#amount(input, meta);

    // This integer calculation matches the actuator, so it can reject invalid amounts locally.
    const otherQuant = proportionalOther(sides.reserve, sides.otherReserve, quant);
    if (otherQuant <= 0n) {
      throw new UsageError(
        "invalid_value",
        errorMessage`${inputRef("amount")} is too small for this pair's current ratio: the other side works out to 0 ${otherMeta.label}`,
      );
    }
    if (action === "withdraw") {
      if (quant > sides.reserve || otherQuant > sides.otherReserve) {
        throw new ChainError("insufficient_reserve", "the pair does not hold that much liquidity");
      }
    }

    const outcome = await this.pipeline.runTron({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      ...tronTransactionHooks(gateway),
      preflight: null,
      confirm: tronConfirmation(gateway, scope),
      build: (from) =>
        action === "inject"
          ? gateway.buildExchangeInject(from, exchange.exchangeId, sides.tokenId, String(quant))
          : gateway.buildExchangeWithdraw(from, exchange.exchangeId, sides.tokenId, String(quant)),
      estimate: async () => ({ feeModel: "tron-resource", note: `${action} uses bandwidth only` }),
    });
    const data = outcomeData(outcome);
    // Prefer the receipt amount; project reserves from the pre-transaction snapshot.
    const realisedOther =
      action === "inject"
        ? receiptOf(data).exchangeInjectedOther
        : receiptOf(data).exchangeWithdrawnOther;
    const otherFinal = realisedOther === undefined ? otherQuant : BigInt(String(realisedOther));
    const sign = action === "inject" ? 1n : -1n;
    return {
      kind: (action === "inject" ? "exchange-inject" : "exchange-withdraw") as
        "exchange-inject" | "exchange-withdraw",
      ...data,
      exchangeId: exchange.exchangeId,
      pair: `${tokenIdLabel(exchange.firstTokenId)}:${tokenIdLabel(exchange.secondTokenId)}`,
      creatorAddress: owner,
      tokenId: sides.tokenId,
      tokenQuant: String(quant),
      tokenLabel: meta.label,
      tokenDecimals: meta.decimals,
      otherTokenId: sides.otherTokenId,
      otherTokenQuant: String(otherFinal),
      otherTokenLabel: otherMeta.label,
      otherTokenDecimals: otherMeta.decimals,
      reserveAfter: String(sides.reserve + sign * quant),
      otherReserveAfter: String(sides.otherReserve + sign * otherFinal),
    };
  }

  async #requireExchange(gateway: TronGateway, id: number): Promise<TronExchange> {
    const exchange = await gateway.getExchangeById(id);
    if (!exchange) throw new ChainError("exchange_not_found", `no exchange pair has id ${id}`);
    return exchange;
  }

  #sides(exchange: TronExchange, tokenId: string) {
    const first = tokenId === exchange.firstTokenId;
    if (!first && tokenId !== exchange.secondTokenId) {
      throw new ChainError(
        "token_not_in_exchange",
        `${tokenIdLabel(tokenId)} is not one of this pair's tokens (${tokenIdLabel(exchange.firstTokenId)} / ${tokenIdLabel(exchange.secondTokenId)})`,
      );
    }
    const firstBalance = BigInt(exchange.firstTokenBalance);
    const secondBalance = BigInt(exchange.secondTokenBalance);
    if (firstBalance <= 0n || secondBalance <= 0n) {
      throw new ChainError("exchange_closed", "one side of this pair holds nothing; it is closed");
    }
    return {
      tokenId,
      otherTokenId: first ? exchange.secondTokenId : exchange.firstTokenId,
      reserve: first ? firstBalance : secondBalance,
      otherReserve: first ? secondBalance : firstBalance,
    };
  }

  async #tokenMeta(gateway: TronGateway, tokenId: string): Promise<TokenMeta> {
    if (tokenId === TRX_TOKEN_ID) return { tokenId, decimals: TRX_DECIMALS, label: "TRX" };
    const asset = await gateway.getAssetById(tokenId);
    if (!asset) throw new ChainError("asset_not_found", `no TRC10 has id ${tokenId}`);
    return { tokenId, decimals: asset.precision ?? 0, label: asset.name };
  }

  #amount(input: AmountInput, meta: TokenMeta): bigint {
    const given = [input.amount !== undefined, input.rawAmount !== undefined].filter(
      Boolean,
    ).length;
    if (given !== 1) {
      throw new UsageError(
        "invalid_option",
        errorMessage`provide exactly one of ${inputRef("amount")} or ${inputRef("rawAmount")}`,
      );
    }
    const raw =
      input.amount !== undefined
        ? toBaseUnits(input.amount, meta.decimals, meta.label)
        : input.rawAmount!;
    return assertPositive(BigInt(raw), inputRef("amount"));
  }

  async #pairAmounts(
    input: ExchangeCreateInput,
    first: TokenMeta,
    second: TokenMeta,
  ): Promise<[bigint, bigint]> {
    const given = [input.amounts !== undefined, input.rawAmounts !== undefined].filter(
      Boolean,
    ).length;
    if (given !== 1) {
      throw new UsageError(
        "invalid_option",
        errorMessage`provide exactly one of ${inputRef("amounts")} or ${inputRef("rawAmounts")}`,
      );
    }
    const pair = inputRef(input.amounts !== undefined ? "amounts" : "rawAmounts");
    const [a, b] = splitPair((input.amounts ?? input.rawAmounts)!, pair);
    const convert = (value: string, meta: TokenMeta): bigint => {
      const raw =
        input.amounts !== undefined
          ? toBaseUnits(value.trim(), meta.decimals, meta.label)
          : value.trim();
      if (!/^\d+$/.test(raw))
        throw new UsageError("invalid_value", errorMessage`${pair} must hold two whole numbers`);
      const parsed = BigInt(raw);
      if (!isPositive(parsed))
        throw new UsageError(
          "invalid_value",
          errorMessage`${pair} sides must both be greater than zero`,
        );
      return parsed;
    };
    return [convert(a, first), convert(b, second)];
  }

  #tradeFloor(
    scope: TransactionScope,
    input: ExchangeTradeInput,
    predicted: bigint,
    buyMeta: TokenMeta,
  ): bigint {
    const given = [
      input.minReceived !== undefined,
      input.rawMinReceived !== undefined,
      input.slippage !== undefined,
    ].filter(Boolean).length;
    if (given > 1) {
      throw new UsageError(
        "invalid_option",
        errorMessage`choose at most one of ${inputRef("minReceived")}, ${inputRef("rawMinReceived")}, ${inputRef("slippage")}`,
      );
    }
    if (input.minReceived !== undefined) {
      return BigInt(
        toBaseUnits(input.minReceived, buyMeta.decimals, buyMeta.label, inputRef("minReceived")),
      );
    }
    if (input.rawMinReceived !== undefined) return BigInt(input.rawMinReceived);
    if (input.slippage !== undefined) return slippageFloor(predicted, input.slippage);
    scope.warn(
      errorMessage`no slippage protection: this trade accepts any non-zero return at any price. Pass ${inputRef("slippage")} or ${inputRef("minReceived")} to set a floor.`,
    );
    return UNPROTECTED_FLOOR;
  }
}
