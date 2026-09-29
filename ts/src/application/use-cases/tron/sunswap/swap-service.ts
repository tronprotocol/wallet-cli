import { resolveTronAccount } from "../../../services/tron-account.js";
import { tradeOutput } from "../trade-output.js";
/**
 * `sunswap swap` — the market decision, and the bonding-curve branch.
 *
 * The routing question comes FIRST, before anything is quoted, and it is answered identically in
 * every mode: quote, dry-run and execute. A quote from one market and a fill on the other is the
 * one failure in this command that costs money silently, so the decision is made once, from
 * on-chain state, and never inferred twice.
 *
 * The rule (PM 5.1.2): on TRON mainnet, if exactly one side is native TRX and the other is a
 * SunPump token still TRADING on its curve, the trade goes through the curve. Everything else
 * goes to the Universal Router.
 *
 * If the curve's state cannot be READ, this reports `provider_error` and stops. It does not fall
 * back to the router — a failed probe is not evidence that the router is the right market, and
 * guessing would be the exact mistake the single-decision rule exists to prevent.
 */
import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import type { TransactionScope } from "../../../contracts/execution-scope.js";
import type { TransactionModeInput } from "../../../contracts/transaction-input.js";
import type { ContractCallPayload } from "../../../contracts/tron-contract-call.js";
import type { LaunchpadPort, LaunchpadTokenFacts } from "../../../ports/sunpump/launchpad.js";
import type { RouterPort, RouterRoute } from "../../../ports/sunswap/router.js";
import type { LiquidityPort } from "../../../ports/sunswap/liquidity.js";
import { bestRoute } from "../../../../domain/sunswap/route-choice.js";
import type { ChainGatewayProvider } from "../../../ports/chain/gateway-provider.js";
import type { TxPipeline } from "../../../services/pipeline/index.js";
import {
  outcomeData,
  transactionMode,
  transactionRequiresSigner,
} from "../../../services/transaction-mode.js";
import type { SunSwapTokenResolver } from "../../../services/sunswap-token-resolver.js";
import { LiquidityTransactions, type ApprovalPlan } from "./liquidity-transactions.js";
import { ChainError, UsageError, WalletError } from "../../../../domain/errors/index.js";
import { toBaseUnits } from "../../../../domain/amounts/index.js";
import { NATIVE_TRX_ADDRESS } from "../../../../domain/sunswap/tokens.js";
import type { RouterExecutionPort } from "../../../ports/sunswap/router-execution.js";
import type { Permit2Port } from "../../../ports/sunswap/permit2.js";
import type { SignerResolver } from "../../../services/signer/index.js";
import { obtainSignature } from "../../../services/signing/obtain-signature.js";
import type { TypedDataPayload } from "../../../../domain/types/index.js";
import {
  assertPermitAuthorizes,
  assertSignedBy,
  type PermitFacts,
} from "../../../../domain/sunswap/permit2-guard.js";
import { recoverTronSigner } from "../../../../domain/sunswap/permit2-recover.js";
import { assertRouterCallMatches } from "../../../../domain/sunswap/router-call-guard.js";
import {
  bipsToSlippage,
  DEFAULT_SWAP_SLIPPAGE,
  LAUNCHPAD_STATE,
  slippageToBips,
} from "../../../../domain/sunpump/curve.js";

const KIND = "sunswap-swap" as const;

/** 2^256-1. Correct for a curve sale and for nothing in the liquidity commands. */
const UNLIMITED = (2n ** 256n - 1n).toString();

/**
 * How long a Permit2 grant lives, and how long the swap stays valid.
 *
 * An hour for the grant, because it must outlive the approval transaction ahead of it and the
 * signing prompt, and must not outlive the trade by days: the SDK's own swap planner asks for
 * THIRTY DAYS, which is the standing allowance Permit2 exists to avoid. Thirty minutes for the
 * transaction, matching the liquidity commands' deadline default.
 */
const PERMIT_TTL_SECONDS = 3600;
const SWAP_VALID_SECONDS = 1800;

/**
 * The fee limit a router swap carries when the caller names none.
 *
 * Ours, not the encoder's: left unset the SDK defaults to 500000000 SUN — 500 TRX — which a swap
 * could quietly burn. 100 TRX is the same default every other write in this CLI uses.
 */
const DEFAULT_SWAP_FEE_LIMIT_SUN = "100000000";

/** One side of a swap, as the receipt publishes it and as the guards compare it. */
interface SwapSide {
  readonly address: string;
  readonly symbol: string;
  readonly decimals: number;
}

export interface SwapInput extends TransactionModeInput {
  readonly tokenIn: string;
  readonly tokenOut: string;
  /** whole tokens of `tokenIn`, as typed. */
  readonly amountIn: string;
  readonly slippage?: string;
  readonly quote?: boolean;
  readonly all?: boolean;
  readonly feeLimit?: string;
}

/** Which market answered. Published in every mode, because it changes what the numbers mean. */
export type SwapMarket = "sunpump" | "sunswap";

export class SunSwapSwapService {
  /** the curve branch's transactions, approving through the launchpad that pulls the tokens. */
  private readonly tx: LiquidityTransactions<"sunpump-launchpad">;
  /**
   * the router branch's, approving through the SunSwap port.
   *
   * Two instances rather than one because the approve/confirm/re-read sequence reads the allowance
   * back through the SAME port it approved with, and the two branches deal with different
   * contracts: a curve sale approves the launchpad, a router swap approves Permit2. Sharing one
   * instance would have a SunSwap swap asking the SunPump port about a Permit2 allowance, which
   * happens to compile because the seam is structural.
   */
  private readonly routerTx: LiquidityTransactions<"sunswap-contracts">;

  constructor(
    private readonly launchpad: LaunchpadPort,
    private readonly gateways: ChainGatewayProvider,
    pipeline: TxPipeline,
    private readonly tokens: SunSwapTokenResolver,
    private readonly router: RouterPort,
    /** token facts for the router branch, whose service sends symbols but no decimals. */
    private readonly liquidity: LiquidityPort,
    private readonly routerExec: RouterExecutionPort,
    private readonly permits: Permit2Port,
    /** for the Permit2 typed data, which is signed outside `TxPipeline` because it is not a
     *  transaction. Everything it signs is checked before and after by the domain guards. */
    private readonly signers: SignerResolver,
  ) {
    this.tx = new LiquidityTransactions(launchpad, gateways, pipeline);
    this.routerTx = new LiquidityTransactions(liquidity, gateways, pipeline);
  }

  async swap(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: SwapInput,
  ): Promise<Record<string, unknown>> {
    const inAddress = this.tokens.resolve(network, input.tokenIn);
    const outAddress = this.tokens.resolve(network, input.tokenOut);
    if (inAddress === outAddress) {
      throw new ChainError("same_token", "the two sides of a swap are the same token");
    }
    // Zero is refused before either market is asked: the route service answers it with
    // "INVALID AMOUNT", which would reach the caller as a provider fault rather than their own input.
    // Anything malformed is left to `toBaseUnits`, which needs the token's decimals to judge it.
    if (/^0+(\.0+)?$/.test(input.amountIn.trim())) {
      throw new UsageError("invalid_amount", "<amountIn> must be greater than 0");
    }

    if (!input.quote) {
      try {
        resolveTronAccount(scope);
      } catch (error) {
        // Preserve account-independent build-only refusals when no account is configured.
        // An existing account with the wrong family must still fail before querying a market.
        if (!(error instanceof WalletError && error.code === "missing_wallet_address")) throw error;
      }
    }

    const market = await this.#chooseMarket(network, inAddress, outAddress);
    if (market === "sunswap") {
      return this.#routerSwap(scope, network, input, inAddress, outAddress);
    }
    return this.#curveSwap(scope, network, input, inAddress, outAddress);
  }

  /**
   * The router branch.
   *
   * Quoting is implemented; SENDING is not. A partial execute path that quoted from the router and
   * filled somewhere else would be worse than an honest refusal, so anything that would sign says
   * so plainly and names what does work.
   */
  async #routerSwap(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: SwapInput,
    inAddress: string,
    outAddress: string,
  ): Promise<Record<string, unknown>> {
    const [tokenIn, tokenOut] = await Promise.all([
      this.#facts(network, inAddress),
      this.#facts(network, outAddress),
    ]);
    const amountIn = toBaseUnits(input.amountIn, tokenIn.decimals, tokenIn.symbol, "<amountIn>");
    // BASE UNITS. The service's own parameter takes raw, and a human amount is not an error — it
    // answers with a valid quote for a millionth of the trade.
    const candidates = await this.router.routes(network, {
      fromToken: inAddress,
      toToken: outAddress,
      amountInRaw: amountIn,
    });
    if (candidates.length === 0) {
      throw new ChainError("no_matching_route", "the router found no route for this pair");
    }

    if (input.quote) {
      // `--all` lists every candidate; the default shows the best — which is NOT the first returned.
      const shown = input.all ? [...candidates] : [bestRoute(candidates)];
      return {
        kind: KIND,
        mode: "quote",
        market: "sunswap" as const,
        routes: shown.map((route) => this.#publishRoute(route, tokenIn, tokenOut)),
        routesAvailable: candidates.length,
      };
    }
    return this.#routerSend(scope, network, input, bestRoute(candidates), tokenIn, tokenOut, {
      amountIn,
      nativeIn: isNative(inAddress),
      tokenAddress: inAddress,
    });
  }

  /**
   * Sending a router swap: approve exactly, authorize exactly, encode, check, send.
   *
   * The order is the whole design. The TRC20 approval to Permit2 is for exactly this trade and is
   * confirmed before anything is signed. The Permit2 grant is checked against what we meant to
   * authorize BEFORE a signature exists, and its signer is confirmed by recovery AFTER. The encoded
   * router call is then checked against the same figures, because the floor, the recipient and the
   * deadline live inside the calldata and nowhere else.
   */
  async #routerSend(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: SwapInput,
    chosen: RouterRoute,
    tokenIn: SwapSide,
    tokenOut: SwapSide,
    spending: { amountIn: string; nativeIn: boolean; tokenAddress: string },
  ): Promise<Record<string, unknown>> {
    const mode = transactionMode(input);
    if (mode.buildOnly && !spending.nativeIn) {
      // Ahead of the account requirement on purpose: this refusal does not depend on who is
      // trading, so a caller with no wallet configured should still get the reason rather than
      // being asked for an account first and told about the flag afterwards.
      throw new UsageError(
        "invalid_option",
        "--build-only is not available for a router swap that spends a token: the transaction embeds a Permit2 signature, so it cannot be built before that signature exists. --dry-run validates it, and a swap that spends TRX has no permit and does build",
      );
    }
    if (transactionRequiresSigner(input)) this.routerTx.assertCanSign(scope);
    const owner = resolveTronAccount(scope);
    const bips = slippageToBips(input.slippage ?? DEFAULT_SWAP_SLIPPAGE);
    const minimumOut = floorOf(chosen.amountOutRaw, bips);
    const feeLimit = input.feeLimit ?? DEFAULT_SWAP_FEE_LIMIT_SUN;

    const view: Record<string, unknown> = {
      kind: KIND,
      market: "sunswap" as const,
      account: owner,
      amountIn: spending.amountIn,
      tokenIn,
      tokenOut,
      route: {
        path: this.#publishPath(chosen, tokenIn, tokenOut),
        protocols: chosen.protocols,
        poolFees: chosen.poolFees,
        ...(chosen.containsUnverifiedHook ? { containsUnverifiedHook: true } : {}),
      },
      tradingFee: toBaseUnits(chosen.fee, tokenIn.decimals, tokenIn.symbol, "fee"),
      amountOutExpected: chosen.amountOutRaw,
      priceImpactPercent: chosen.priceImpactPercent,
      priceImpactEstimated: true,
      amountOutMinimum: minimumOut,
      slippage: bipsToSlippage(bips),
    };

    // Native TRX needs no allowance and no permit: it travels as the call's value. So that path is
    // one transaction and can be priced and built like any other.
    if (spending.nativeIn) {
      const call = await this.#encode(network, chosen, owner, bips, minimumOut, feeLimit, {
        amountIn: spending.amountIn,
        nativeIn: true,
      });
      return this.#send(scope, network, input, mode, call, [], view);
    }

    const permit = await this.permits.planPermit(network, {
      owner,
      token: spending.tokenAddress,
      // The Universal Router is what pulls on a swap. Named rather than defaulted, because the same
      // planner also grants to the V4 position manager and a grant to the wrong one is the whole risk.
      spender: this.routerExec.routerAddress(network),
      amount: spending.amountIn,
      ttlSeconds: PERMIT_TTL_SECONDS,
    });
    if (permit === undefined) {
      // A standing Permit2 grant already covers this trade. Not reachable today — the grants this
      // command creates are exact and expire in an hour, so one covering a later swap of the same size
      // within the hour is the only case — and refusing is honest rather than guessing at a struct we
      // never saw. The router call needs the permit IN its calldata, so there is nothing to send.
      throw new ChainError(
        "permit_mismatch",
        "this account already has a Permit2 grant covering the amount, so the planner produced no permit to sign — and a router swap carries the permit inside its own calldata, so there is nothing to send without one. Wait for the existing grant to lapse, or revoke it",
      );
    }
    const approvals = await this.routerTx.planApprovals(network, owner, permit.permit2, [
      { facts: tokenIn, amount: spending.amountIn },
    ]);
    const authorization = {
      permit2: permit.permit2,
      spender: permit.spender,
      amount: permit.amount,
      expiration: permit.expiration,
    };

    if (mode.dryRun) {
      // The swap itself is NOT priced here, and the reason is not caution: encoding it needs the
      // signature, and a dry run does not sign. So the approval is priced for real and the grant's
      // terms are published, which is what a caller came to check.
      const priced = await this.routerTx.priceApprovals(scope, network, approvals, mode, feeLimit);
      return {
        ...view,
        mode: "dry-run",
        approvals: approvals.map(publishedApproval),
        permit: authorization,
        ...priced,
      };
    }

    return this.routerTx.withApprovals(
      scope,
      network,
      approvals,
      owner,
      mode,
      feeLimit,
      async (approvalTxIds) => {
        const signed = await this.#signPermit(scope, network, permit, owner, spending);
        const call = await this.#encode(network, chosen, owner, bips, minimumOut, feeLimit, {
          amountIn: spending.amountIn,
          nativeIn: false,
          permit: { grant: permit.grant, signature: signed.signature, facts: signed.facts },
        });
        return this.#send(scope, network, input, mode, call, approvalTxIds, {
          ...view,
          approvals: approvals.map(publishedApproval),
          permit: authorization,
        });
      },
    );
  }

  /**
   * The Permit2 signature, checked on both sides of the act of signing.
   *
   * Before: the typed data must authorize exactly this trade — this token, this amount, the
   * Universal Router as spender, and an expiry no further out than we asked for. After: the
   * signature must recover to the account we are trading for, and the signer must report having
   * hashed the struct we inspected. Neither check can be moved to the other side; `PermitSingle`
   * carries no owner field, so the owner is only knowable from a finished signature.
   */
  async #signPermit(
    scope: TransactionScope,
    network: NetworkDescriptor,
    permit: { typedData: unknown; permit2: string; spender: string },
    owner: string,
    spending: { amountIn: string; tokenAddress: string },
  ): Promise<{ signature: string; facts: PermitFacts }> {
    const now = Math.floor(Date.now() / 1000);
    const facts = assertPermitAuthorizes(permit.typedData, {
      token: spending.tokenAddress,
      spender: permit.spender,
      permit2: permit.permit2,
      chainId: chainIdOf(network),
      amount: spending.amountIn,
      notAfter: now + PERMIT_TTL_SECONDS,
      now,
    });

    const signer = this.signers.resolve(scope.activeAccount, "tron");
    const signed = await obtainSignature(signer, scope, (opts) =>
      signer.signTypedData(permit.typedData as TypedDataPayload, opts),
    );
    assertSignedBy(
      recoverTronSigner(signed.digest, signed.signature),
      owner,
      signed.primaryType ?? "",
    );
    return { signature: signed.signature, facts };
  }

  /** The encoded router call, checked against the swap that was quoted. */
  async #encode(
    network: NetworkDescriptor,
    chosen: RouterRoute,
    owner: string,
    bips: number,
    minimumOut: string,
    feeLimit: string,
    spending: {
      amountIn: string;
      nativeIn: boolean;
      permit?: { grant: unknown; signature: string; facts: PermitFacts };
    },
  ): Promise<ContractCallPayload> {
    const call = await this.routerExec.buildSwapCall(network, {
      route: chosen.source,
      slippageBips: bips,
      recipient: owner,
      validForSeconds: SWAP_VALID_SECONDS,
      feeLimitSun: feeLimit,
      ...(spending.permit === undefined
        ? {}
        : {
            permit: { grant: spending.permit.grant, signature: spending.permit.signature },
          }),
    });
    /**
     * The chain's clock, not ours, and the SAME read the encoder used.
     *
     * A swap's deadline is enforced against block time, so that is what it is measured against; and
     * because the planner memoises the read, the number here is the number the encoder added its
     * window to. So the bound is exact: any disagreement is a real one, not a clock difference.
     */
    const now = await this.routerExec.transactionTime(network);
    assertRouterCallMatches(call, {
      router: this.routerExec.routerAddress(network),
      amountIn: spending.amountIn,
      minimumOut,
      recipient: owner,
      nativeIn: spending.nativeIn,
      feeLimit,
      notAfter: now + SWAP_VALID_SECONDS,
      now,
      ...(spending.permit === undefined
        ? {}
        : {
            permit: {
              amount: spending.permit.facts.amount,
              expiration: spending.permit.facts.expiration,
            },
          }),
    });
    return {
      target: call.target,
      method: call.functionSelector,
      parameters: call.parameters,
      ...(call.callValue === "0" ? {} : { callValueSun: call.callValue }),
    };
  }

  /** The last step: price it or send it, with the approvals already on chain. */
  async #send(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: SwapInput,
    mode: ReturnType<typeof transactionMode>,
    payload: ContractCallPayload,
    approvalTxIds: readonly string[],
    view: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const feeLimit = input.feeLimit ?? DEFAULT_SWAP_FEE_LIMIT_SUN;
    if (mode.dryRun || mode.buildOnly) {
      const built = mode.dryRun
        ? {
            mode: "dry-run",
            ...(await this.routerTx.priceWithoutSending(
              scope,
              network,
              [],
              payload,
              mode,
              feeLimit,
            )),
          }
        : await this.routerTx.buildOnly(scope, network, [], payload, mode, feeLimit);
      return { ...view, ...built };
    }
    const main = await this.routerTx.run(scope, network, payload, {
      mode,
      estimable: true,
      feeLimit,
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
        this.tokens.resolve(network, input.tokenOut),
        resolveTronAccount(scope),
        "amountOut",
      )),
    };
  }

  /** The chosen route's hops, scaled at the two ends. */
  #publishPath(
    route: RouterRoute,
    tokenIn: SwapSide,
    tokenOut: SwapSide,
  ): readonly Record<string, unknown>[] {
    const last = route.path.length - 1;
    return route.path.map((hop, index) => ({
      address: hop.address,
      symbol: hop.symbol,
      ...(index === 0
        ? { decimals: tokenIn.decimals }
        : index === last
          ? { decimals: tokenOut.decimals }
          : {}),
    }));
  }

  /**
   * What a token is.
   *
   * Read from its contract — except native TRX, which has none: its six decimals are the chain's
   * own definition of SUN, and asking the marker address for `decimals()` gets "Smart contract is
   * not exist".
   */
  async #facts(
    network: NetworkDescriptor,
    address: string,
  ): Promise<{ address: string; symbol: string; decimals: number }> {
    if (isNative(address)) return NATIVE_TRX;
    return this.liquidity.tokenFacts(network, address);
  }

  /**
   * One router route as a quote publishes it.
   *
   * `tradingFee` is DERIVED: the service sends the fee as a human decimal and has no raw field at
   * all, so it is scaled by the INPUT token's decimals — which the service does not send either.
   */
  #publishRoute(
    route: RouterRoute,
    tokenIn: { decimals: number; symbol: string },
    tokenOut: { decimals: number },
  ): Record<string, unknown> {
    // By POSITION, not by symbol: we asked for exactly this pair, so the first and last hops are
    // the two tokens we resolved. Keying on symbol would hand one side the other's scale whenever
    // two different contracts share a ticker, which on TRON they routinely do.
    const last = route.path.length - 1;
    return {
      amountIn: route.amountInRaw,
      amountOut: route.amountOutRaw,
      ...(route.inUsd === undefined ? {} : { inUsd: route.inUsd }),
      ...(route.outUsd === undefined ? {} : { outUsd: route.outUsd }),
      // Published as returned, negative included: a negative impact means the route paid better
      // than the reference price, and clamping it would be editing a measurement.
      priceImpactPercent: route.priceImpactPercent,
      tradingFee: toBaseUnits(route.fee, tokenIn.decimals, tokenIn.symbol, "fee"),
      containsUnverifiedHook: route.containsUnverifiedHook,
      // Each hop carries its scale where we know it. An intermediate token we did not resolve is
      // published without one rather than with a guessed default.
      path: route.path.map((hop, index) => ({
        address: hop.address,
        symbol: hop.symbol,
        ...(index === 0
          ? { decimals: tokenIn.decimals }
          : index === last
            ? { decimals: tokenOut.decimals }
            : {}),
      })),
      protocols: route.protocols,
      poolFees: route.poolFees,
    };
  }

  /**
   * The market, decided once from on-chain state.
   *
   * Exactly one native side, and the other still trading on its curve. A pair with no native side
   * cannot be a curve trade at all, so the curve is not even asked about — which also keeps an
   * ordinary TRC20 pair from paying for a launchpad read it does not need.
   */
  async #chooseMarket(
    network: NetworkDescriptor,
    inAddress: string,
    outAddress: string,
  ): Promise<SwapMarket> {
    const natives = [inAddress, outAddress].filter(isNative).length;
    if (natives !== 1) return "sunswap";
    /**
     * A network with no launchpad has no curve, so there is nothing to ask.
     *
     * The capability gate admits `swap` where EITHER market can be served — a route service or a
     * launchpad. Without this, the implementation required BOTH: a pair with one native side always
     * consulted the curve, so a router-only network refused the commonest swap there is with
     * "no SunPump launchpad configured", naming a market the caller never chose.
     *
     * This is NOT the failed-read case that `#curveState` guards. A read that fails leaves the
     * market genuinely unknown and must stop the command. An absent launchpad is the opposite of
     * unknown: it is certainty that no curve exists here.
     */
    if (!this.#hasLaunchpad(network)) return "sunswap";
    const other = isNative(inAddress) ? outAddress : inAddress;
    const state = await this.#curveState(network, other);
    return state === LAUNCHPAD_STATE.TRADING ? "sunpump" : "sunswap";
  }

  /** Whether this network has a bonding-curve market at all. */
  #hasLaunchpad(network: NetworkDescriptor): boolean {
    try {
      return Boolean(this.launchpad.launchpadAddress(network));
    } catch {
      // The port answers an unconfigured network by throwing; that IS the answer.
      return false;
    }
  }

  /**
   * The curve's state, or a refusal.
   *
   * A read that fails is reported as `provider_error` and stops the command (PM 5.1.2). It is not
   * treated as "not a curve token": that would route to the other market on the strength of a
   * failed request, and the quote and the fill could then land in different places.
   */
  async #curveState(network: NetworkDescriptor, token: string): Promise<number> {
    try {
      return await this.launchpad.tokenState(network, token);
    } catch (error) {
      // A UsageError is OUR fault, not the provider's — an unconfigured network, a bad address —
      // and relabelling it would send a reader looking for a node problem that does not exist.
      // Only a failure to READ becomes provider_error.
      if (error instanceof UsageError) throw error;
      throw new ChainError(
        "provider_error",
        `could not read whether ${token} is still trading on the SunPump curve, so the market for this swap is unknown: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async #curveSwap(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: SwapInput,
    inAddress: string,
    outAddress: string,
  ): Promise<Record<string, unknown>> {
    const buying = isNative(inAddress);
    const tokenAddress = buying ? outAddress : inAddress;
    const facts = await this.launchpad.tokenFacts(network, tokenAddress);
    const tokenIn = buying ? NATIVE_TRX : published(facts);
    const tokenOut = buying ? published(facts) : NATIVE_TRX;

    const amountIn = buying
      ? toBaseUnits(input.amountIn, 6, "TRX", "<amountIn>")
      : toBaseUnits(input.amountIn, facts.decimals, facts.symbol, "<amountIn>");

    const quoted = buying
      ? await this.launchpad.quoteBuy(network, tokenAddress, amountIn)
      : await this.launchpad.quoteSell(network, tokenAddress, amountIn);
    const gross = "tokenAmount" in quoted ? quoted.tokenAmount : quoted.trxAmountSun;
    // Selling pays the fee out of the TRX received; buying pays it out of the TRX sent, so the
    // token amount quoted is already net of it.
    const expected = buying ? gross : (BigInt(gross) - BigInt(quoted.feeSun)).toString();
    if (BigInt(expected) <= 0n) {
      throw new UsageError(
        "invalid_amount",
        `this swap would return ${gross} SUN, which the ${quoted.feeSun} SUN SunPump platform fee consumes entirely`,
      );
    }

    // One hop, no pool fees, and no price impact: a curve has no pool to move against, so the key
    // is absent rather than zero (PM 5.1.2). `decimals` on each hop is ours, added to PM's shape:
    // an amount without its scale is the defect this codebase has shipped three times, and a
    // quote's amounts are scaled by nothing else in the payload.
    const path = [
      { address: tokenIn.address, symbol: tokenIn.symbol, decimals: tokenIn.decimals },
      { address: tokenOut.address, symbol: tokenOut.symbol, decimals: tokenOut.decimals },
    ];
    const route = {
      path,
      protocols: ["SUNPUMP"],
      poolFees: ["0", "0"],
    };

    /**
     * A quote is PLURAL, and always an array (PM 5.1.4).
     *
     * `routes` is an array whether one candidate came back or five, so an agent parses a quote the
     * same way either way, and `routesAvailable` says how many exist without being asked for them.
     * A curve has exactly one and always will — but the shape is the router's shape, so that
     * `--all` means something when the router branch lands rather than being decorative.
     *
     * It publishes no floor: `--quote` refuses `--slippage`, so a minimum would come from a
     * default the caller never chose and nothing would enforce it.
     */
    if (input.quote) {
      return {
        kind: KIND,
        mode: "quote",
        market: "sunpump" as const,
        routes: [
          {
            amountIn,
            amountOut: expected,
            ...route,
            // SunPump's platform fee, not a pool fee. Same key as a router route, different
            // meaning, which is why `market` sits beside it.
            tradingFee: quoted.feeSun,
          },
        ],
        routesAvailable: 1,
      };
    }

    const view = {
      kind: KIND,
      market: "sunpump" as const,
      amountIn,
      tokenIn,
      tokenOut,
      route,
      tradingFee: quoted.feeSun,
    };

    const bips = slippageToBips(input.slippage ?? DEFAULT_SWAP_SLIPPAGE);
    const minimum = this.launchpad.applyFloor(expected, bips);
    const priced = {
      ...view,
      amountOutExpected: expected,
      amountOutMinimum: minimum,
      slippage: bipsToSlippage(bips),
    };

    const owner = resolveTronAccount(scope);
    const payload = buying
      ? this.launchpad.buyPayload(network, {
          token: tokenAddress,
          trxSun: amountIn,
          minTokenAmount: minimum,
        })
      : this.launchpad.sellPayload(network, {
          token: tokenAddress,
          tokenAmount: amountIn,
          minTrxSun: minimum,
        });

    const approvals = buying ? [] : await this.#sellApprovals(network, owner, facts, amountIn);

    return this.#execute(scope, network, input, payload, approvals, {
      ...priced,
      account: owner,
    });
  }

  /**
   * A curve sale's approval: the launchpad, without limit.
   *
   * Identical to `sunpump sell`, because it is the same contract pulling the same tokens — and the
   * balance is checked first so a sale the account cannot cover fails before a fee is spent.
   */
  async #sellApprovals(
    network: NetworkDescriptor,
    owner: string,
    facts: LaunchpadTokenFacts,
    amountIn: string,
  ): Promise<ApprovalPlan[]> {
    const held = await this.launchpad.balanceOf(network, facts.address, owner);
    if (BigInt(held) < BigInt(amountIn)) {
      throw new ChainError(
        "insufficient_token_balance",
        `this swap sells ${amountIn} of ${facts.symbol} in base units and the account holds ${held}`,
      );
    }
    return this.tx.planApprovals(network, owner, this.launchpad.launchpadAddress(network), [
      { facts, amount: UNLIMITED },
    ]);
  }

  async #execute(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: SwapInput,
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
        ...(approvals.length === 0 ? {} : { approvals: approvals.map(publishedApproval) }),
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
            this.tokens.resolve(network, input.tokenOut),
            resolveTronAccount(scope),
            "amountOut",
          )),
        };
      },
    );
  }
}

/**
 * The floor, as integer arithmetic on base units.
 *
 * Never floats: a 0.5% floor on an 18-decimal amount is exactly the case where a double loses the
 * last digits, and the number this produces is the one the transaction will enforce.
 */
function floorOf(expected: string, bips: number): string {
  return ((BigInt(expected) * BigInt(10_000 - bips)) / 10_000n).toString();
}

/**
 * The chain id the Permit2 domain must be bound to.
 *
 * Taken from the network descriptor rather than from the SDK, so a signature for another chain is
 * caught by comparing two independent sources rather than one against itself.
 */
function chainIdOf(network: NetworkDescriptor): string {
  const id = (network as { chainId?: unknown }).chainId;
  if (typeof id === "string" && /^\d+$/.test(id)) return id;
  throw new ChainError(
    "provider_error",
    `network ${network.id} carries no numeric chain id, so a Permit2 domain cannot be checked against it`,
  );
}

/** Native TRX, as a swap side. Its decimals are the chain's definition of SUN, not a contract's. */
const NATIVE_TRX = { address: NATIVE_TRX_ADDRESS, symbol: "TRX", decimals: 6 } as const;

function published(facts: LaunchpadTokenFacts): {
  address: string;
  symbol: string;
  decimals: number;
} {
  return { address: facts.address, symbol: facts.symbol, decimals: facts.decimals };
}

function publishedApproval(approval: ApprovalPlan): Record<string, unknown> {
  return {
    token: approval.token,
    spender: approval.spender,
    amount: approval.amount === UNLIMITED ? "unlimited" : approval.amount,
    symbol: approval.symbol,
    decimals: approval.decimals,
  };
}

function isNative(address: string): boolean {
  return address === NATIVE_TRX_ADDRESS;
}
