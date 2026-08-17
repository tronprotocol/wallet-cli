/**
 * Bancor exchange — the `exchange` command group.
 *
 * TRON carries an automatic market maker at protocol level: no order book, no counterparty, price
 * set by the pair's two reserves along a curve. It trades TRX and TRC10 only.
 *
 * Three things shape this file:
 *   - **Only the creator may inject or withdraw.** A pair is private market-making, not a public
 *     pool, and the binding cannot be transferred.
 *   - **Our pricing advises, it never gates** (docs/adr/0002). `bancorOutput` derives the
 *     `--slippage` floor and the `--dry-run` estimate; nothing is refused on its say-so. Rejections
 *     come only from exact integer checks or from the node.
 *   - **Token ids only, never names.** A TRC10 name may contain `:`, which would make
 *     `--pair A:B:1000123` ambiguous.
 */
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { ChainError, UsageError } from "../../../domain/errors/index.js";
import { toBaseUnits } from "../../../domain/amounts/index.js";
import {
  TRX_TOKEN_ID,
  bancorOutput,
  normalizeTokenId,
  proportionalOther,
  slippageFloor,
  splitPair,
  tokenIdLabel,
} from "../../../domain/exchange/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronExchange, TronGateway } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import {
  outcomeData,
  transactionMode,
  transactionRequiresSigner,
  type TransactionModeInput,
} from "../../services/transaction-mode.js";
import { tronConfirmation } from "../../services/tron-confirmation.js";
import { tronTransactionHooks } from "./multisig-authorization.js";

const TRX_DECIMALS = 6;
/** the protocol requires a positive `expected`; this is "no slippage protection". */
const UNPROTECTED_FLOOR = 1n;

/** display metadata for one side of a pair. */
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

  // ── reads ────────────────────────────────────────────────────────────────────
  async show(network: NetworkDescriptor, input: ExchangeShowInput) {
    const gateway = this.gateways.get(network, "tron");
    const exchange = await this.#requireExchange(gateway, input.id);
    // One pair, so two O(1) lookups at most: enough to render whole tokens and names. `list` is the
    // command that must never fan out (docs/adr/0005).
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

  /** Exactly one RPC, whatever the page size — no per-row token lookups (docs/adr/0005). */
  async list(network: NetworkDescriptor, input: ExchangeListInput) {
    const gateway = this.gateways.get(network, "tron");
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

  // ── writes ───────────────────────────────────────────────────────────────────
  async create(scope: TransactionScope, network: NetworkDescriptor, input: ExchangeCreateInput) {
    if (transactionRequiresSigner(input)) this.pipeline.assertCanSign(scope.activeAccount, "tron");
    const gateway = this.gateways.get(network, "tron");
    const owner = scope.resolveAddress("tron");

    const [rawFirst, rawSecond] = splitPair(input.pair, "--pair");
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

    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      ...tronTransactionHooks(gateway),
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
      // the chain assigns the id; it is only in the receipt, so absent until confirmed
      ...(data.exchangeId === undefined ? {} : { exchangeId: Number(data.exchangeId) }),
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
    const gateway = this.gateways.get(network, "tron");
    const owner = scope.resolveAddress("tron");
    const exchange = await this.#requireExchange(gateway, input.id);
    const sellTokenId = normalizeTokenId(input.sell);
    const sides = this.#sides(exchange, sellTokenId);
    const [sellMeta, buyMeta] = await Promise.all([
      this.#tokenMeta(gateway, sides.tokenId),
      this.#tokenMeta(gateway, sides.otherTokenId),
    ]);
    const sellQuant = this.#amount(input, sellMeta, "--amount");

    // Advisory only: this drives --slippage and the dry-run preview, and never rejects (ADR-0002).
    const predicted = bancorOutput(sides.reserve, sides.otherReserve, sellQuant);
    const floor = this.#tradeFloor(scope, input, predicted, buyMeta);

    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      ...tronTransactionHooks(gateway),
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
      // the realised amount exists only in the receipt; our own figure stays labelled an estimate
      ...(data.exchangeReceived === undefined
        ? {}
        : { receivedQuant: String(data.exchangeReceived) }),
      estimatedReceivedQuant: String(predicted),
      minReceivedQuant: String(floor),
    };
  }

  // ── shared write path for inject / withdraw ───────────────────────────────────
  async #liquidity(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: ExchangeLiquidityInput,
    action: "inject" | "withdraw",
  ) {
    if (transactionRequiresSigner(input)) this.pipeline.assertCanSign(scope.activeAccount, "tron");
    const gateway = this.gateways.get(network, "tron");
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
    const quant = this.#amount(input, meta, "--amount");

    // Exact integer arithmetic — the same expression the actuator evaluates — so it is safe to
    // reject on, unlike the Bancor curve.
    const otherQuant = proportionalOther(sides.reserve, sides.otherReserve, quant);
    if (otherQuant <= 0n) {
      throw new UsageError(
        "invalid_value",
        `--amount is too small for this pair's current ratio: the other side works out to 0 ${otherMeta.label}`,
      );
    }
    if (action === "withdraw") {
      if (quant > sides.reserve || otherQuant > sides.otherReserve) {
        throw new ChainError("insufficient_reserve", "the pair does not hold that much liquidity");
      }
    }

    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      ...tronTransactionHooks(gateway),
      confirm: tronConfirmation(gateway, scope),
      build: (from) =>
        action === "inject"
          ? gateway.buildExchangeInject(from, exchange.exchangeId, sides.tokenId, String(quant))
          : gateway.buildExchangeWithdraw(from, exchange.exchangeId, sides.tokenId, String(quant)),
      estimate: async () => ({ feeModel: "tron-resource", note: `${action} uses bandwidth only` }),
    });
    const data = outcomeData(outcome);
    // The receipt states the other side authoritatively; before confirmation our own exact figure
    // stands, and reserves after are pre-state ± the amounts, so no extra read is needed.
    const realisedOther =
      action === "inject" ? data.exchangeInjectedOther : data.exchangeWithdrawnOther;
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

  // ── helpers ──────────────────────────────────────────────────────────────────
  async #requireExchange(gateway: TronGateway, id: number): Promise<TronExchange> {
    const exchange = await gateway.getExchangeById(id);
    if (!exchange) throw new ChainError("exchange_not_found", `no exchange pair has id ${id}`);
    return exchange;
  }

  /** orient a pair around the side the caller named, and refuse a closed pair. */
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

  /** TRX needs no lookup; a TRC10 costs one, and an unknown id is a usage error, not a crash. */
  async #tokenMeta(gateway: TronGateway, tokenId: string): Promise<TokenMeta> {
    if (tokenId === TRX_TOKEN_ID) return { tokenId, decimals: TRX_DECIMALS, label: "TRX" };
    const asset = await gateway.getAssetById(tokenId);
    if (!asset) throw new ChainError("asset_not_found", `no TRC10 has id ${tokenId}`);
    return { tokenId, decimals: asset.precision ?? 0, label: asset.name };
  }

  /** exactly one of --amount (whole tokens, needs the token's precision) or --raw-amount. */
  #amount(input: AmountInput, meta: TokenMeta, flag: string): bigint {
    const given = [input.amount !== undefined, input.rawAmount !== undefined].filter(
      Boolean,
    ).length;
    if (given !== 1) {
      throw new UsageError(
        "invalid_option",
        `provide exactly one of ${flag} or ${flag.replace("--", "--raw-")}`,
      );
    }
    const raw =
      input.amount !== undefined
        ? toBaseUnits(input.amount, meta.decimals, meta.label)
        : input.rawAmount!;
    const value = BigInt(raw);
    if (value <= 0n) throw new UsageError("invalid_value", `${flag} must be greater than zero`);
    return value;
  }

  /** `--amounts a:b` / `--raw-amounts a:b`, one half per side of the pair. */
  async #pairAmounts(
    input: ExchangeCreateInput,
    first: TokenMeta,
    second: TokenMeta,
  ): Promise<[bigint, bigint]> {
    const given = [input.amounts !== undefined, input.rawAmounts !== undefined].filter(
      Boolean,
    ).length;
    if (given !== 1) {
      throw new UsageError("invalid_option", "provide exactly one of --amounts or --raw-amounts");
    }
    const flag = input.amounts !== undefined ? "--amounts" : "--raw-amounts";
    const [a, b] = splitPair((input.amounts ?? input.rawAmounts)!, flag);
    const convert = (value: string, meta: TokenMeta): bigint => {
      const raw =
        input.amounts !== undefined
          ? toBaseUnits(value.trim(), meta.decimals, meta.label)
          : value.trim();
      if (!/^\d+$/.test(raw))
        throw new UsageError("invalid_value", `${flag} must hold two whole numbers`);
      const parsed = BigInt(raw);
      if (parsed <= 0n)
        throw new UsageError("invalid_value", `${flag} sides must both be greater than zero`);
      return parsed;
    };
    return [convert(a, first), convert(b, second)];
  }

  /**
   * The on-chain `expected`. `--min-received` is taken as given; `--slippage` derives it from the
   * predicted output at build time; omitting both means no protection, which the protocol can only
   * express as `expected = 1` — recorded as a warning so an agent reading json can see it.
   */
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
        "choose at most one of --min-received, --raw-min-received, --slippage",
      );
    }
    if (input.minReceived !== undefined) {
      return BigInt(
        toBaseUnits(input.minReceived, buyMeta.decimals, buyMeta.label, "--min-received"),
      );
    }
    if (input.rawMinReceived !== undefined) return BigInt(input.rawMinReceived);
    if (input.slippage !== undefined) return slippageFloor(predicted, input.slippage);
    scope.warn(
      "no slippage protection: this trade accepts any non-zero return at any price. " +
        "Pass --slippage or --min-received to set a floor.",
    );
    return UNPROTECTED_FLOOR;
  }
}
