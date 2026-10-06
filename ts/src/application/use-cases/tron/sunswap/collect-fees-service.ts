import { resolveTronAccount } from "../../../services/tron-account.js";
/**
 * SunSwap collect-fees — taking a position's earnings without touching its principal.
 *
 * The narrowest of the three liquidity commands, and the differences are all subtractions:
 *
 * - V3 and V4 only. A V2 pool has no separable fees at all: they accrue into the LP token's own
 *   value, so there is nothing to claim — which is a different statement from "V2 is not
 *   supported".
 * - There is no "how much" on either protocol. `collect` takes what the position is owed, and it
 *   is owed in full (PM 6.3.1). A partial option would suggest a choice the contract does not
 *   offer.
 * - Nothing is approved and no Permit2 is involved: the position manager already holds the
 *   position on both protocols.
 * - On V3, `remove-liquidity` already collects the fees alongside the principal, so this command
 *   exists for the case where the principal should stay where it is.
 *
 * WHAT A V4 RECEIPT CLAIMS, AND WHEN. The V3 path reads what the contract itself says is owed
 * (`v3OwedFees`) and reports it, both in the dry run and — after the event — as what arrived. V4
 * now has its own read, `v4OwedFees`, over the LP fee helper, and the receipt carries the two
 * figures it returns (PM 6.3.4).
 *
 * That read is BEST EFFORT, and its failure is a third state rather than a zero. A dry run against
 * an unreachable node still previews the call, and a helper that cannot be read or decoded leaves
 * the receipt with NO amount and a warning — exactly the receipt this command produced before the
 * read existed, pointing at `sunswap position-list` for the unclaimed value. A zero is published
 * only when the helper answered zero. On a command whose whole purpose is collecting money, "0"
 * reads as "nothing was owed", and that is a claim only a measurement may make.
 *
 * ONE THING IS DELIBERATELY NOT SAID. Whether V4's `decreaseLiquidity` also pays out the accrued
 * fees — as V3's does — is unresolved here, and it cannot be settled without sending a
 * transaction. So nothing on this path claims it either way: no warning is copied over from V3's
 * removal, and no wording suggests a V4 withdrawal leaves the fees behind.
 */
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
import { isTronNetwork } from "../../../../domain/types/network.js";
import { resolveDeadline } from "../../../../domain/sunswap/liquidity.js";
import { NATIVE_TRX_ADDRESS } from "../../../../domain/sunswap/tokens.js";
import { describeHooks } from "../../../../domain/sunswap/v4-pool.js";
import { LiquidityTransactions, outcomeTxId } from "./liquidity-transactions.js";

/**
 * The lookup for the resolution further in. The entry has already resolved `token0`/`token1`
 * against the account's book, so what reaches these calls is an address (a pass-through) or a
 * builtin; a caller that skipped the entry gets the official layer only.
 */
const RESOLVED = { caller: "liquidity" } as const;

/** The receipt's `kind`, one value across every mode this command has (PM 2.9). */
const KIND = "sunswap-collect-fees" as const;

/**
 * The tier `--fee` means when the caller named the pair but not the tier (PM 6.3.3).
 *
 * It selects nothing — the position names its own pool — so all this default can do is disagree
 * with the position, and a disagreement is refused rather than resolved.
 */

export interface CollectFeesInput extends TransactionModeInput {
  readonly protocol: string;
  readonly positionId: string;
  /** V3 only: the fees go to the signing account on V4, and the flag is refused there. */
  readonly recipient?: string;
  /** V4 only, and optional: the pair as a CROSS-CHECK against the one the position holds. */
  readonly token0?: string;
  readonly token1?: string;
  /** V4 only: the tier, checked the same way. Accepted only alongside the pair. */
  readonly fee?: number;
  /** V4 only: the call carries a deadline; V3's `collect` does not. */
  readonly deadline?: number;
  readonly feeLimit?: string;
}

export interface CollectedSide {
  readonly address: string;
  readonly symbol: string;
  readonly decimals: number;
  /**
   * Base units estimated before sending, then actual settlement after confirmation.
   * Absent when neither an estimate nor a receipt is available.
   */
  readonly amount?: string;
}

export interface CollectFeesView {
  readonly account: string;
  readonly protocol: "V3" | "V4";
  readonly positionManager: string;
  readonly nftTokenId: string;
  /**
   * Always true: the pair is read from the position on both protocols.
   *
   * V4 accepts `--token0` / `--token1`, but they never SELECT anything — the position names its
   * own pool and the pair it reports is what is used. The flags are checked against it and
   * discarded, so the pair on the receipt came from the chain either way (PM 6.3.4).
   */
  readonly tokensAuto: true;
  /** the RESOLVED address the fees go to — never a placeholder, because a script has to know. */
  readonly recipient: string;
  readonly token0: CollectedSide;
  readonly token1: CollectedSide;
  // ── V4 ──────────────────────────────────────────────────────────────────────
  /** the 32-byte pool id. A V4 pool has no address, so this is what names it. */
  readonly poolId?: string;
  readonly feeTier?: number;
  /** part of the pool's identity on V4, rather than implied by the fee tier. */
  readonly tickSpacing?: number;
  /** already the WORD for it — "none" for an unhooked pool — never the zero address. */
  readonly hooks?: string;
  /** seconds since epoch, after which the call stops being valid. V4 only. */
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
      // Only V4 reads the pair: it is the cross-check against the position's own currencies.
      const book = this.tokens.resolvePair(network, input, {
        caller: "liquidity",
        account: tokenBookAccount(scope),
      });
      return withTokenBook(await this.#collectV4(scope, network, book.input), book.resolved);
    }
    // Not "unknown protocol": V2's fees are real, they simply are not separable — they accrue
    // into the LP token's value and come out when the liquidity does.
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
    // A collection of nothing is not a small collection. Measured on Nile: the contract accepts
    // it, emits a Collect of zero, charges 8.08 TRX and the receipt reads "Fees collected" — a
    // transaction that looks like success and leaves the caller poorer. It is refused in EVERY
    // mode, ahead of the estimate, so a dry run and a build answer exactly as the execute would.
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

    // Re-read the owner immediately before sending: a dry run can be minutes old, and a position
    // that changed hands in between must not have its fees claimed on this account's behalf.
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
    const manager = positionManagerOf(network);
    const position = await this.#assertOwned(network, input.positionId, owner);
    const recipient = input.recipient ?? owner;
    const [token0, token1, owed] = await Promise.all([
      this.liquidity.tokenFacts(network, position.token0),
      this.liquidity.tokenFacts(network, position.token1),
      // What the contract itself says is claimable — the same figure the transaction will move,
      // so the dry run promises exactly what the receipt will report.
      this.liquidity.v3OwedFees(network, position.tokenId, recipient),
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

  /**
   * What actually arrived, from the transaction's own `Collect` event.
   *
   * The owed figure was read a moment before sending, and a trade in between changes it. The
   * event is what the contract recorded paying out. Best-effort: the fees are already the
   * caller's, so a failed read costs the exact figure, not the collection.
   */
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
      const actual = await this.liquidity.v3CollectedAmounts(network, txId);
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

  // ── V4 ──────────────────────────────────────────────────────────────────────

  /**
   * A V4 collection.
   *
   * ONE call, like V3's, and with the same absences: no amount to choose, no approval, no
   * Permit2. What V4 adds is the pool key the call carries, and that key is the whole risk of
   * this path — see `#planV4`.
   */
  async #collectV4(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: CollectFeesInput,
  ): Promise<Record<string, unknown>> {
    const owner = resolveTronAccount(scope);
    const { plan, position, request } = await this.#planV4(scope, network, owner, input);
    const mode = transactionMode(input);
    if (transactionRequiresSigner(input)) this.tx.assertCanSign(scope);
    /**
     * A collection of nothing is not a small collection — the same reason V3 refuses one, and in
     * every mode for the same reason: a dry run and a build answer exactly as the execute would.
     *
     * On V4 it also has to run BEFORE the estimate. The collect call is a zero-delta
     * `decreaseLiquidity`, and on an empty position the contract reverts it with
     * `CannotUpdateEmptyPosition` (0xaefeb924), so an estimate reached here would fail as
     * `execution_reverted` instead of saying what is actually wrong.
     *
     * The predicate is NOT V3's, and the difference is the whole point. V3's `nothingOwed` reads a
     * missing amount as zero, which is right there because V3 always has the figure. Here the
     * amount is absent whenever the fee read failed, and refusing on THAT would block a caller from
     * collecting real fees because we could not read them. So both sides must be present AND zero:
     * a measured nothing is refused, an unknown is sent.
     *
     * The one exception is an EMPTY position: the contract refuses any modification of one, so its
     * collect could never be sent whatever the fee read said, and it is refused the same way.
     */
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

    // Re-read the owner immediately before sending, for the same reason V3 does: a dry run can be
    // minutes old, and a position that changed hands in between must not have its fees claimed on
    // this account's behalf.
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

  /**
   * Everything a V4 collection needs, decided before anything is sent.
   *
   * THE POOL KEY IS THE POOL'S OWN, verbatim from `v4PoolState(position.poolId)` — currencies,
   * hooks, fee and the `parameters` word alike. Re-encoding `parameters` from the tick spacing
   * would be our guess at a layout the pool has already stated, and a key that differs by one bit
   * names a different pool.
   *
   * `--token0` / `--token1` and `--fee` are CROSS-CHECKS, never selectors: the position names its
   * own pool, so all the caller's pair can do is disagree, and a disagreement is refused rather
   * than resolved in either direction.
   */
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
    // Defensive: the command schema refuses each of these at parse time, where it is deterministic
    // and needs no wallet. Restated here because the use case is also reachable directly, and a
    // recipient silently dropped is a collection sent somewhere the caller did not ask for.
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
      /**
       * `--fee` cross-checks ONLY when the caller gave one.
       *
       * PM 6.3.3 gives it a default of 500, and that default is dropped here on purpose. On V4 the
       * position names its own pool, so this flag selects nothing and can only ever AGREE or
       * DISAGREE. A default that can only disagree is not a default — it is a refusal waiting for
       * everyone whose position is not in the 500 tier, over a value they never typed. PM's 500 is
       * right where it selects something, as on add-liquidity's new position; here it does not.
       */
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
      // What the LP fee helper says is owed, if it can be asked at all.
      this.#owedFees(scope, network, position),
    ]);
    const deadline = resolveDeadline(input.deadline, Date.now());

    return {
      plan: {
        account: owner,
        protocol: "V4",
        positionManager: this.liquidity.v4PositionManager(network),
        nftTokenId: position.tokenId,
        // The pair came from the pool, not from the caller, whether or not they named it.
        tokensAuto: true,
        // Always the signing account: `--recipient` is refused on this path.
        recipient: owner,
        // The measurement or nothing — never a zero standing in for an unanswered question.
        token0: owed === undefined ? unpriced(token0) : collected(token0, owed.amount0),
        token1: owed === undefined ? unpriced(token1) : collected(token1, owed.amount1),
        poolId: pool.poolId,
        feeTier: pool.fee,
        tickSpacing: pool.tickSpacing,
        // The word for it, never the zero address — which on TRON is also native TRX's address,
        // so printing it would say the pool is hooked to TRX.
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
          // The pool's OWN word, never re-encoded from the spacing.
          parameters: pool.parameters,
        },
        tokenId: position.tokenId,
        recipient: owner,
        deadline,
      },
    };
  }

  /**
   * The fees the position is owed, or nothing at all — and never a zero for "we could not tell".
   *
   * Best effort by design. A dry run exists to be run before committing to anything, including
   * against a node that is slow, rate-limited or briefly unreachable, so a fee helper that cannot
   * be reached must not turn the preview into a failure. When it cannot answer, the receipt goes
   * out with no amount and a warning saying where the figure can be found instead.
   */
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

  /**
   * The caller's pair against the position's own, as a set.
   *
   * Unordered on purpose: V4's currency order is the key's, not the caller's, and a caller who
   * wrote the two sides the other way round has named the same pool. What this exists to catch is
   * a caller collecting from a position they did not mean to, and that is caught either way round.
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

  /** Native TRX has no contract to ask; V4 keys carry it unwrapped. */
  async #facts(network: NetworkDescriptor, address: string): Promise<TokenFacts> {
    if (address === NATIVE_TRX_ADDRESS) return { address, decimals: 6, symbol: "TRX" };
    return this.liquidity.tokenFacts(network, address);
  }
}

/** decimals travels with the amount, always — see the receipt-scale test. */
function collected(facts: TokenFacts, amount: string): CollectedSide {
  return {
    address: facts.address,
    symbol: facts.symbol,
    decimals: facts.decimals,
    amount,
  };
}

/** A side with no amount: the read did not answer, and a zero would claim that it had. */
function unpriced(facts: TokenFacts): CollectedSide {
  return { address: facts.address, symbol: facts.symbol, decimals: facts.decimals };
}

/**
 * Both sides read successfully AND both are zero.
 *
 * Deliberately not `?? "0"`: an absent amount means the read failed, which is a different fact from
 * a zero and must not be refused on.
 */
function measuredNothingOwed(plan: CollectFeesView): boolean {
  const a = plan.token0.amount;
  const b = plan.token1.amount;
  if (a === undefined || b === undefined) return false;
  return BigInt(a) === 0n && BigInt(b) === 0n;
}

/** One refusal for both protocols and every mode, so the three answers cannot drift apart. */
function noFeesToCollect(tokenId: string): UsageError {
  return new UsageError(
    "invalid_value",
    `position ${tokenId} has no fees to collect; sending this would spend a fee to receive nothing`,
  );
}

function nothingOwed(plan: CollectFeesView): boolean {
  return BigInt(plan.token0.amount ?? "0") === 0n && BigInt(plan.token1.amount ?? "0") === 0n;
}

function positionManagerOf(network: NetworkDescriptor): string {
  const manager = isTronNetwork(network)
    ? network.sunswap?.contracts?.v3PositionManager
    : undefined;
  if (!manager) {
    throw new UsageError(
      "unsupported_network",
      `network ${network.id} has no SunSwap V3 position manager configured`,
    );
  }
  return manager;
}
