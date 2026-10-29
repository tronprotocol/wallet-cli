import { resolveTronAccount } from "../../../services/tron-account.js";
import type { NetworkDescriptor, TxOutcome } from "../../../../domain/types/index.js";
import type { TransactionScope } from "../../../contracts/execution-scope.js";
import type { TransactionModeInput } from "../../../contracts/transaction-input.js";
import type {
  ContractCallPayload,
  LiquidityPort,
  TokenFacts,
  V3Position,
  V4OwedFees,
  V4Position,
} from "../../../ports/sunswap/liquidity.js";
import type { ChainGatewayProvider } from "../../../ports/chain/gateway-provider.js";
import type { TxPipeline } from "../../../services/pipeline/index.js";
import {
  tokenBookAccount,
  withTokenBook,
  type SunSwapTokenResolver,
} from "../../../services/sunswap-token-resolver.js";
import {
  outcomeData,
  transactionMode,
  transactionRequiresSigner,
} from "../../../services/transaction-mode.js";
import { warnOnPostCheck } from "../../../services/post-check.js";
import { ChainError, UsageError } from "../../../../domain/errors/index.js";
import { readPosition } from "./position-read.js";
import { redactErrorMessage } from "../../../../domain/errors/redact.js";
import { resolveDeadline } from "../../../../domain/sunswap/liquidity.js";
import { NATIVE_TRX_ADDRESS } from "../../../../domain/sunswap/tokens.js";
import { describeHooks } from "../../../../domain/sunswap/v4-pool.js";
import { LiquidityTransactions, outcomeTxId } from "./liquidity-transactions.js";
import { FAMILIES } from "../../../../domain/family/index.js";
import type { Sun } from "../../../../domain/amounts/index.js";

const RESOLVED = { caller: "liquidity" } as const;

const KIND = "sunswap-collect-fees" as const;

export interface CollectFeesInput extends TransactionModeInput {
  readonly protocol: string;
  readonly positionId: string;
  // V3 only; V4 pays the signing account.
  readonly recipient?: string;
  // V4 pair cross-check; both tokens must be supplied together.
  readonly token0?: string;
  readonly token1?: string;
  // V4 tier cross-check, accepted only with the pair.
  readonly fee?: number;
  // V4 only; Unix seconds.
  readonly deadline?: number;
  readonly feeLimit?: Sun;
}

export interface CollectedSide {
  readonly address: string;
  readonly symbol: string;
  readonly decimals: number;
  // Base units; estimated before confirmation, replaced by settlement when available.
  readonly amount?: string;
}

export interface CollectFeesView {
  readonly account: string;
  readonly protocol: "V3" | "V4";
  readonly positionManager: string;
  readonly nftTokenId: string;
  // The pair comes from the position, even when the caller supplies a cross-check.
  readonly tokensAuto: true;
  readonly recipient: string;
  readonly token0: CollectedSide;
  readonly token1: CollectedSide;
  // 32-byte V4 pool id.
  readonly poolId?: string;
  readonly feeTier?: number;
  // V4 pool identity; independent of the fee tier.
  readonly tickSpacing?: number;
  // "none" for an unhooked pool.
  readonly hooks?: string;
  // Unix seconds; V4 only.
  readonly deadline?: number;
}

export class SunSwapCollectFeesService {
  private readonly tx: LiquidityTransactions;

  constructor(
    private readonly liquidity: LiquidityPort,
    gateways: ChainGatewayProvider,
    pipeline: TxPipeline,
    private readonly tokens: SunSwapTokenResolver,
  ) {
    this.tx = new LiquidityTransactions(liquidity, gateways, pipeline);
  }

  async collectFees(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: CollectFeesInput,
  ): Promise<Record<string, unknown>> {
    const protocol = input.protocol.toUpperCase();
    if (protocol === "V4") {
      const book = this.tokens.resolvePair(network, input, {
        caller: "liquidity",
        account: tokenBookAccount(scope),
      });
      return withTokenBook(await this.#collectV4(scope, network, book.input), book.resolved);
    }
    if (protocol !== "V3") {
      throw new UsageError(
        "invalid_value",
        "collect-fees is V3 and V4 only; a V2 pool's fees accrue into the LP token itself and are taken out with the liquidity, so there is nothing separate to claim",
      );
    }

    const owner = resolveTronAccount(scope);
    const { plan, position } = await this.#plan(network, owner, input);
    const mode = transactionMode(input);
    if (transactionRequiresSigner(input)) this.tx.assertCanSign(scope);
    // Reject zero-fee collections in every mode before spending on estimation or execution.
    if (nothingOwed(plan)) throw noFeesToCollect(plan.nftTokenId);

    const payload = this.#payload(network, plan);
    if (mode.dryRun) {
      const priced = await this.tx.priceWithoutSending(
        scope,
        network,
        [],
        payload,
        mode,
        input.feeLimit,
      );
      return { kind: KIND, mode: "dry-run", ...plan, ...priced };
    }
    if (mode.buildOnly) {
      const built = await this.tx.buildOnly(scope, network, [], payload, mode, input.feeLimit);
      return { kind: KIND, ...plan, ...built };
    }

    // Ownership can change while the collection is being prepared.
    await this.#assertOwned(network, position.tokenId, owner);
    const main = await this.tx.run(scope, network, payload, {
      mode,
      estimable: true,
      feeLimit: input.feeLimit,
    });
    const settled = await this.#settle(scope, network, plan, main);

    return {
      kind: KIND,
      account: plan.account,
      protocol: plan.protocol,
      positionManager: plan.positionManager,
      nftTokenId: plan.nftTokenId,
      tokensAuto: true,
      recipient: plan.recipient,
      token0: plan.token0,
      token1: plan.token1,
      ...outcomeData(main),
      amountsEstimated: true,
      ...settled,
    };
  }

  async #plan(
    network: NetworkDescriptor,
    owner: string,
    input: CollectFeesInput,
  ): Promise<{ plan: CollectFeesView; position: V3Position }> {
    const manager = this.liquidity.contracts(network).v3PositionManager;
    const position = await this.#assertOwned(network, input.positionId, owner);
    const recipient = input.recipient ?? owner;
    const [token0, token1, owed] = await Promise.all([
      this.liquidity.tokenFacts(network, position.token0),
      this.liquidity.tokenFacts(network, position.token1),
      this.liquidity.v3OwedFees(network, position.tokenId, recipient, owner),
    ]);

    return {
      plan: {
        account: owner,
        protocol: "V3",
        positionManager: manager,
        nftTokenId: position.tokenId,
        tokensAuto: true,
        recipient,
        token0: collected(token0, owed.amount0),
        token1: collected(token1, owed.amount1),
      },
      position,
    };
  }

  #payload(network: NetworkDescriptor, plan: CollectFeesView): ContractCallPayload {
    return this.liquidity.v3CollectFeesPayload(network, {
      tokenId: plan.nftTokenId,
      recipient: plan.recipient,
    });
  }

  // Settlement is best effort; a receipt read failure must not fail a confirmed collection.
  async #settle(
    scope: TransactionScope,
    network: NetworkDescriptor,
    plan: CollectFeesView,
    outcome: TxOutcome,
  ): Promise<Record<string, unknown>> {
    if (outcome.stage !== "confirmed") return {};
    const txId = outcomeTxId(outcome);
    if (txId === undefined) return {};
    let settled: Record<string, unknown> = {};
    await warnOnPostCheck(scope, "sunswap_collected_postread", async () => {
      const actual = await this.liquidity.v3CollectedAmounts(network, txId, plan.nftTokenId);
      if (!actual) {
        return "the collection confirmed but its Collect event could not be read, so the receipt reports what was owed beforehand rather than what arrived";
      }
      settled = {
        amountsEstimated: false,
        token0: { ...plan.token0, amount: actual.amount0 },
        token1: { ...plan.token1, amount: actual.amount1 },
      };
      return undefined;
    });
    return settled;
  }

  async #assertOwned(
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

  async #collectV4(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: CollectFeesInput,
  ): Promise<Record<string, unknown>> {
    const owner = resolveTronAccount(scope);
    const { plan, position, request } = await this.#planV4(scope, network, owner, input);
    const mode = transactionMode(input);
    if (transactionRequiresSigner(input)) this.tx.assertCanSign(scope);
    // V4 rejects empty-position updates; check before estimation even if fees are unknown.
    if (measuredNothingOwed(plan) || BigInt(position.liquidity) === 0n) {
      throw noFeesToCollect(request.tokenId);
    }

    const payload = this.liquidity.v4CollectPayload(network, request);
    if (mode.dryRun) {
      const priced = await this.tx.priceWithoutSending(
        scope,
        network,
        [],
        payload,
        mode,
        input.feeLimit,
      );
      return { kind: KIND, mode: "dry-run", ...plan, ...priced };
    }
    if (mode.buildOnly) {
      const built = await this.tx.buildOnly(scope, network, [], payload, mode, input.feeLimit);
      return { kind: KIND, ...plan, ...built };
    }

    // Ownership can change while the collection is being prepared.
    await this.#assertV4Owned(network, request.tokenId, owner);
    const main = await this.tx.run(scope, network, payload, {
      mode,
      estimable: true,
      feeLimit: input.feeLimit,
    });

    let settled: Record<string, unknown> = {};
    const txId = outcomeTxId(main);
    if (main.stage === "confirmed" && txId !== undefined) {
      await warnOnPostCheck(scope, "sunswap_collect_amounts", async () => {
        const actual = await this.liquidity.v4LiquidityResult(network, txId, {
          poolId: plan.poolId!,
          tokenId: plan.nftTokenId,
          account: plan.recipient,
          token0: plan.token0.address,
          token1: plan.token1.address,
        });
        if (!actual)
          return "the collection confirmed but its actual amounts could not be read; amounts remain estimates";
        settled = {
          token0: { ...plan.token0, amount: actual.balanceDelta0 },
          token1: { ...plan.token1, amount: actual.balanceDelta1 },
          amountsEstimated: false,
        };
        return undefined;
      });
    }
    return { kind: KIND, ...plan, ...outcomeData(main), amountsEstimated: true, ...settled };
  }

  async #planV4(
    scope: TransactionScope,
    network: NetworkDescriptor,
    owner: string,
    input: CollectFeesInput,
  ): Promise<{
    plan: CollectFeesView;
    position: V4Position;
    request: {
      pool: {
        currency0: string;
        currency1: string;
        hooks: string;
        fee: number;
        parameters: string;
      };
      tokenId: string;
      recipient: string;
      deadline: number;
    };
  }> {
    if (input.recipient !== undefined) {
      throw new UsageError(
        "invalid_option",
        "--recipient is not accepted on V4; the fees always go to the signing account",
      );
    }
    const named = (input.token0 === undefined ? 0 : 1) + (input.token1 === undefined ? 0 : 1);
    if (named === 1) {
      throw new UsageError(
        "missing_option",
        "--token0 and --token1 must be given together on V4, or both left out and read from the position",
      );
    }
    if (input.fee !== undefined && named === 0) {
      throw new UsageError(
        "missing_option",
        "--fee is accepted on V4 only alongside --token0 and --token1; on its own it checks nothing",
      );
    }

    const position = await this.#assertV4Owned(network, input.positionId, owner);
    if (named === 2) {
      this.#assertPairMatches(network, position, input.token0!, input.token1!);
      // Only an explicit fee is a cross-check; a default would reject other tiers.
      if (input.fee !== undefined && input.fee !== position.fee) {
        throw new UsageError(
          "invalid_value",
          `--fee ${input.fee} does not match position ${position.tokenId}, which is in a ${position.fee} tier pool`,
        );
      }
    }

    const pool = await this.liquidity.v4PoolState(network, position.poolId);
    if (!pool.exists) {
      throw new ChainError(
        "pool_not_found",
        `no V4 pool with id ${position.poolId} has been initialised on this network`,
      );
    }

    const [token0, token1, owed] = await Promise.all([
      this.#facts(network, pool.currency0),
      this.#facts(network, pool.currency1),
      this.#owedFees(scope, network, position),
    ]);
    const deadline = resolveDeadline(input.deadline, Date.now());

    return {
      plan: {
        account: owner,
        protocol: "V4",
        positionManager: this.liquidity.v4PositionManager(network),
        nftTokenId: position.tokenId,
        tokensAuto: true,
        recipient: owner,
        // Unknown fees must remain absent, not zero.
        token0: owed === undefined ? unpriced(token0) : collected(token0, owed.amount0),
        token1: owed === undefined ? unpriced(token1) : collected(token1, owed.amount1),
        poolId: pool.poolId,
        feeTier: pool.fee,
        tickSpacing: pool.tickSpacing,
        hooks: describeHooks(pool.hooks),
        deadline,
      },
      position,
      request: {
        pool: {
          currency0: pool.currency0,
          currency1: pool.currency1,
          hooks: pool.hooks,
          fee: pool.fee,
          // Preserve the pool's parameters verbatim: changing any bit changes its identity.
          parameters: pool.parameters,
        },
        tokenId: position.tokenId,
        recipient: owner,
        deadline,
      },
    };
  }

  // A failed fee read must not block collection or be reported as zero.
  async #owedFees(
    scope: TransactionScope,
    network: NetworkDescriptor,
    position: V4Position,
  ): Promise<V4OwedFees | undefined> {
    let owed: V4OwedFees | undefined;
    try {
      owed = await this.liquidity.v4OwedFees(network, {
        tokenId: position.tokenId,
        poolId: position.poolId,
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
      });
    } catch (error) {
      scope.warn({
        code: "sunswap_v4_owed_fees_unavailable",
        message: `the fees owed to position ${position.tokenId} could not be read, so this receipt reports no amount; 'sunswap position-list' reports the unclaimed value: ${redactErrorMessage(
          error instanceof Error ? error.message : String(error),
        )}`,
      });
      return undefined;
    }
    if (owed === undefined) {
      scope.warn({
        code: "sunswap_v4_owed_fees_undecodable",
        message: `the LP fee helper answered for position ${position.tokenId} in a shape this could not decode, so this receipt reports no amount rather than a zero; 'sunswap position-list' reports the unclaimed value`,
      });
    }
    return owed;
  }

  // Either token order identifies the same pair.
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

  async #assertV4Owned(
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

  // Native TRX has no token contract; V4 keys carry it unwrapped.
  async #facts(network: NetworkDescriptor, address: string): Promise<TokenFacts> {
    if (address === NATIVE_TRX_ADDRESS)
      return { address, decimals: FAMILIES.tron.nativeDecimals, symbol: "TRX" };
    return this.liquidity.tokenFacts(network, address);
  }
}

function collected(facts: TokenFacts, amount: string): CollectedSide {
  return {
    address: facts.address,
    symbol: facts.symbol,
    decimals: facts.decimals,
    amount,
  };
}

function unpriced(facts: TokenFacts): CollectedSide {
  return { address: facts.address, symbol: facts.symbol, decimals: facts.decimals };
}

// An absent amount is unknown, so only two measured zeros justify rejection.
function measuredNothingOwed(plan: CollectFeesView): boolean {
  const a = plan.token0.amount;
  const b = plan.token1.amount;
  if (a === undefined || b === undefined) return false;
  return BigInt(a) === 0n && BigInt(b) === 0n;
}

function noFeesToCollect(tokenId: string): UsageError {
  return new UsageError(
    "invalid_value",
    `position ${tokenId} has no fees to collect; sending this would spend a fee to receive nothing`,
  );
}

function nothingOwed(plan: CollectFeesView): boolean {
  return BigInt(plan.token0.amount ?? "0") === 0n && BigInt(plan.token1.amount ?? "0") === 0n;
}
