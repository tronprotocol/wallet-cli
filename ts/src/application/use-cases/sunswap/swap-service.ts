import { endedByDeadline, requestDispatchCheck } from "../../services/command-deadline.js";
import { systemWallClock, type WallClock } from "../../contracts/wall-clock.js";
import type { ExecutionDeadline } from "../../contracts/deadline.js";
import { activeTronAccount, resolveTronAccount } from "../../services/tron/tron-account.js";
import { tradeOutput } from "../../services/trade-output.js";
import { quoteCurveSale } from "../sunpump/curve-sale.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { TransactionModeInput } from "../../contracts/transaction-input.js";
import type { ContractCallPayload } from "../../contracts/tron/tron-contract-call.js";
import type { LaunchpadPort, LaunchpadTokenFacts } from "../../ports/sunpump/launchpad.js";
import type { RouterPort, RouterRoute } from "../../ports/sunswap/router.js";
import type { LiquidityPort } from "../../ports/sunswap/liquidity.js";
import { bestRoute } from "../../../domain/sunswap/route-choice.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import {
  outcomeData,
  transactionMode,
  transactionRequiresSigner,
} from "../../services/transaction-mode.js";
import {
  tokenBookAccount,
  withTokenBook,
  type SunSwapTokenResolver,
} from "../../services/sunswap/sunswap-token-resolver.js";
import { LiquidityTransactions, type ApprovalPlan } from "./liquidity-transactions.js";
import { UNLIMITED_ALLOWANCE } from "../../../domain/token/allowance.js";
import { DEFAULT_FEE_LIMIT_SUN } from "../../../domain/fees/tron.js";
import {
  ChainError,
  errorMessage,
  inputRef,
  UsageError,
  WalletError,
} from "../../../domain/errors/index.js";
import { toBaseUnits, type Sun, sunAmount, baseUnitAmount } from "../../../domain/amounts/index.js";
import { NATIVE_TRX_ADDRESS } from "../../../domain/sunswap/tokens.js";
import { lowerBySlippage } from "../../../domain/sunswap/liquidity.js";
import type { RouterExecutionPort } from "../../ports/sunswap/router-execution.js";
import type { Permit2Port } from "../../ports/sunswap/permit2.js";
import type { SignerResolver } from "../../services/signer/index.js";
import type { SigningService } from "../../services/signing/signing-service.js";
import type { NetworkDescriptor, TypedDataPayload } from "../../../domain/types/index.js";
import {
  assertPermitAuthorizes,
  assertSignedBy,
  PERMIT2_GRANT_TTL_SECONDS,
  type PermitFacts,
} from "../../../domain/sunswap/permit2-guard.js";
import { recoverTronSigner } from "../../../domain/sunswap/permit2-recover.js";
import { assertRouterCallMatches } from "../../../domain/sunswap/router-call-guard.js";
import {
  bipsToSlippage,
  DEFAULT_SWAP_SLIPPAGE,
  LAUNCHPAD_STATE,
  selectFloor,
} from "../../../domain/sunpump/curve.js";
import { FAMILIES } from "../../../domain/family/index.js";

const KIND = "sunswap-swap" as const;

const SWAP_VALID_SECONDS = 1800;

interface SwapSide {
  readonly address: string;
  readonly symbol: string;
  readonly decimals: number;
}

export interface SwapInput extends TransactionModeInput {
  readonly tokenIn: string;
  readonly tokenOut: string;
  // Whole input tokens.
  readonly amountIn: string;
  readonly slippage?: string;
  // tokenOut base units; excludes slippage.
  readonly minOut?: string;
  readonly quote?: boolean;
  readonly all?: boolean;
  readonly feeLimit?: Sun;
}

export type SwapMarket = "sunpump" | "sunswap";

export class SunSwapSwapService {
  private readonly tx: LiquidityTransactions<"sunpump-launchpad">;
  // Approval construction and allowance reads must use the same protocol's port.
  private readonly routerTx: LiquidityTransactions<"sunswap-contracts">;

  constructor(
    private readonly launchpad: LaunchpadPort,
    private readonly gateways: ChainGatewayProvider,
    pipeline: TxPipeline,
    private readonly tokens: SunSwapTokenResolver,
    private readonly router: RouterPort,
    private readonly liquidity: LiquidityPort,
    private readonly routerExec: RouterExecutionPort,
    private readonly permits: Permit2Port,
    private readonly signers: SignerResolver,
    private readonly signing: SigningService,
    private readonly now: WallClock = systemWallClock,
  ) {
    this.tx = new LiquidityTransactions(launchpad, gateways, pipeline, now);
    this.routerTx = new LiquidityTransactions(liquidity, gateways, pipeline, now);
  }

  async swap(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: SwapInput,
  ): Promise<Record<string, unknown>> {
    // Quotes and execution must resolve symbols against the same account's token book.
    const lookup = { caller: "swap", account: tokenBookAccount(scope) } as const;
    const resolvedIn = this.tokens.resolveToken(network, input.tokenIn, lookup);
    const resolvedOut = this.tokens.resolveToken(network, input.tokenOut, lookup);
    const inAddress = resolvedIn.address;
    const outAddress = resolvedOut.address;
    input = { ...input, tokenIn: inAddress, tokenOut: outAddress };
    if (inAddress === outAddress) {
      throw new ChainError("same_token", "the two sides of a swap are the same token");
    }
    // The route service classifies zero as a provider fault; reject it as invalid input here.
    if (/^0+(\.0+)?$/.test(input.amountIn.trim())) {
      throw new UsageError("invalid_amount", "<amountIn> must be greater than 0");
    }

    if (!input.quote) {
      try {
        resolveTronAccount(scope);
      } catch (error) {
        // Preserve account-free build-only errors; still reject accounts from the wrong family.
        if (!(error instanceof WalletError && error.code === "missing_wallet_address")) throw error;
      }
    }

    const market = await this.#chooseMarket(scope.deadline, network, inAddress, outAddress);
    const result =
      market === "sunswap"
        ? await this.#routerSwap(scope, network, input, inAddress, outAddress)
        : await this.#curveSwap(scope, network, input, inAddress, outAddress);
    return withTokenBook(result, [resolvedIn, resolvedOut]);
  }

  async #routerSwap(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: SwapInput,
    inAddress: string,
    outAddress: string,
  ): Promise<Record<string, unknown>> {
    const [tokenIn, tokenOut] = await Promise.all([
      this.#facts(scope.deadline, network, inAddress),
      this.#facts(scope.deadline, network, outAddress),
    ]);
    const amountIn = toBaseUnits(input.amountIn, tokenIn.decimals, tokenIn.symbol, "<amountIn>");
    // The route API accepts base units; whole tokens would silently quote a smaller trade.
    const candidates = await this.router.routes(
      network,
      {
        fromToken: inAddress,
        toToken: outAddress,
        amountInRaw: amountIn,
      },
      requestDispatchCheck(scope.deadline),
    );
    if (candidates.length === 0) {
      throw new ChainError("no_matching_route", "the router found no route for this pair");
    }

    if (input.quote) {
      // The first candidate need not be the best route.
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

  // Confirm approvals before signing permits, then validate the encoded call before sending.
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
    if (mode.mode === "build-only" && !spending.nativeIn) {
      // This refusal is account-independent and must precede account resolution.
      throw new UsageError(
        "invalid_option",
        errorMessage`${inputRef("buildOnly")} is not available for a router swap that spends a token: the transaction embeds a Permit2 signature, so it cannot be built before that signature exists. ${inputRef("dryRun")} validates it, and a swap that spends TRX has no permit and does build`,
      );
    }
    if (transactionRequiresSigner(input)) this.routerTx.assertCanSign(scope);
    const owner = resolveTronAccount(scope);
    await this.#assertCovers(scope.deadline, network, owner, tokenIn, spending);
    const floor = selectFloor(input.slippage, input.minOut, DEFAULT_SWAP_SLIPPAGE);
    const minimumOut =
      floor.kind === "min-out" ? floor.amount : lowerBySlippage(chosen.amountOutRaw, floor.bips);
    assertQuoteMeetsFloor(chosen.amountOutRaw, minimumOut);
    const feeLimit = input.feeLimit ?? DEFAULT_FEE_LIMIT_SUN;

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
      ...(floor.kind === "slippage" ? { slippage: bipsToSlippage(floor.bips) } : {}),
    };

    // Native TRX travels as call value and needs no permit signature.
    if (spending.nativeIn) {
      const call = await this.#encode(
        scope.deadline,
        network,
        chosen,
        owner,
        minimumOut,
        feeLimit,
        {
          amountIn: spending.amountIn,
          nativeIn: true,
        },
      );
      return this.#send(scope, network, input, mode, call, [], view);
    }

    const permit = await this.permits.planPermit(
      network,
      {
        owner,
        token: spending.tokenAddress,
        spender: this.routerExec.routerAddress(network),
        amount: baseUnitAmount(spending.amountIn),
        ttlSeconds: PERMIT2_GRANT_TTL_SECONDS,
      },
      requestDispatchCheck(scope.deadline),
    );
    if (permit === undefined) {
      // A standing Permit2 grant suffices, but the token's allowance to Permit2 still needs checking.
      const approvals = await this.routerTx.planApprovals(
        scope.deadline,
        network,
        owner,
        this.liquidity.permit2Address(network),
        [{ facts: tokenIn, amount: spending.amountIn }],
      );
      const encode = () =>
        this.#encode(scope.deadline, network, chosen, owner, minimumOut, feeLimit, {
          amountIn: spending.amountIn,
          nativeIn: false,
        });
      if (mode.mode === "dry-run") {
        return {
          ...view,
          mode: "dry-run",
          approvals: approvals.map(publishedApproval),
          ...(await this.routerTx.priceWithoutSending(
            scope,
            network,
            approvals,
            await encode(),
            mode,
            feeLimit,
          )),
        };
      }
      return this.routerTx.withApprovals(
        scope,
        network,
        approvals,
        owner,
        mode,
        feeLimit,
        async (approvalTxIds) =>
          this.#send(scope, network, input, mode, await encode(), approvalTxIds, {
            ...view,
            approvals: approvals.map(publishedApproval),
          }),
      );
    }
    const approvals = await this.routerTx.planApprovals(
      scope.deadline,
      network,
      owner,
      permit.permit2,
      [{ facts: tokenIn, amount: spending.amountIn }],
    );
    const authorization = {
      permit2: permit.permit2,
      spender: permit.spender,
      amount: permit.amount,
      expiration: permit.expiration,
      ttlSeconds: PERMIT2_GRANT_TTL_SECONDS,
    };

    if (mode.mode === "dry-run") {
      // An unsigned permit prevents encoding and estimating the swap; price approvals only.
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
        const call = await this.#encode(
          scope.deadline,
          network,
          chosen,
          owner,
          minimumOut,
          feeLimit,
          {
            amountIn: spending.amountIn,
            nativeIn: false,
            permit: { grant: permit.grant, signature: signed.signature, facts: signed.facts },
          },
        );
        const sent = await this.#send(scope, network, input, mode, call, approvalTxIds, {
          ...view,
          approvals: approvals.map(publishedApproval),
          permit: authorization,
        });
        // The TRC20 allowance to Permit2 has no expiry and survives a failed swap.
        return sent.stage === "failed" ? { ...sent, approvalRemains: true } : sent;
      },
    );
  }

  // Check funds before spending on approvals; this check excludes chain fees.
  async #assertCovers(
    deadline: ExecutionDeadline,
    network: NetworkDescriptor,
    owner: string,
    tokenIn: SwapSide,
    spending: { amountIn: string; nativeIn: boolean; tokenAddress: string },
  ): Promise<void> {
    const account = await activeTronAccount(deadline, this.gateways, network, owner);
    const native = BigInt(account.balance ?? "0");
    if (spending.nativeIn) {
      if (native < BigInt(spending.amountIn)) {
        throw new ChainError(
          "insufficient_balance",
          `this swap spends ${spending.amountIn} SUN and the account holds ${native}`,
        );
      }
      return;
    }
    const held = await this.liquidity.balanceOf(
      network,
      spending.tokenAddress,
      owner,
      requestDispatchCheck(deadline),
    );
    if (BigInt(held) < BigInt(spending.amountIn)) {
      throw new ChainError(
        "insufficient_token_balance",
        `this swap sells ${spending.amountIn} of ${tokenIn.symbol} in base units and the account holds ${held}`,
      );
    }
  }

  // Check permit terms before signing; PermitSingle has no owner, so recover it afterward.
  async #signPermit(
    scope: TransactionScope,
    network: NetworkDescriptor,
    permit: { typedData: TypedDataPayload; permit2: string; spender: string },
    owner: string,
    spending: { amountIn: string; tokenAddress: string },
  ): Promise<{ signature: string; facts: PermitFacts }> {
    const now = Math.floor(this.now() / 1000);
    const facts = assertPermitAuthorizes(permit.typedData, {
      token: spending.tokenAddress,
      spender: permit.spender,
      permit2: permit.permit2,
      chainId: chainIdOf(network),
      amount: spending.amountIn,
      notAfter: now + PERMIT2_GRANT_TTL_SECONDS,
      now,
    });

    const signer = this.signers.resolve(scope.activeAccount, "tron");
    const signed = await this.signing.sign(scope, {
      network,
      origin: "service",
      signer,
      payload: { kind: "typed-data", typedData: permit.typedData },
    });
    assertSignedBy(
      recoverTronSigner(signed.digest, signed.signature),
      owner,
      signed.primaryType ?? "",
    );
    return { signature: signed.signature, facts };
  }

  async #encode(
    commandDeadline: ExecutionDeadline,
    network: NetworkDescriptor,
    chosen: RouterRoute,
    owner: string,
    minimumOut: string,
    feeLimit: Sun,
    spending: {
      amountIn: string;
      nativeIn: boolean;
      permit?: { grant: unknown; signature: string; facts: PermitFacts };
    },
  ): Promise<ContractCallPayload> {
    const call = await this.routerExec.buildSwapCall(
      network,
      {
        route: chosen.source,
        amountOutMinimum: minimumOut,
        recipient: owner,
        validForSeconds: SWAP_VALID_SECONDS,
        feeLimitSun: feeLimit,
        ...(spending.permit === undefined
          ? {}
          : {
              permit: { grant: spending.permit.grant, signature: spending.permit.signature },
            }),
      },
      requestDispatchCheck(commandDeadline),
    );
    // Use the encoder's memoized chain time so deadline checks share its clock.
    const now = await this.routerExec.transactionTime(
      network,
      requestDispatchCheck(commandDeadline),
    );
    const checked = assertRouterCallMatches(call, {
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
      ...(checked.callValue === "0" ? {} : { callValueSun: checked.callValue }),
    };
  }

  async #send(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: SwapInput,
    mode: ReturnType<typeof transactionMode>,
    payload: ContractCallPayload,
    approvalTxIds: readonly string[],
    view: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const feeLimit = input.feeLimit ?? DEFAULT_FEE_LIMIT_SUN;
    if (mode.mode === "dry-run" || mode.mode === "build-only") {
      const built =
        mode.mode === "dry-run"
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
        input.tokenOut,
        resolveTronAccount(scope),
        "amountOut",
      )),
    };
  }

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

  // Native TRX has no token contract to query.
  async #facts(
    deadline: ExecutionDeadline,
    network: NetworkDescriptor,
    address: string,
  ): Promise<{ address: string; symbol: string; decimals: number }> {
    if (isNative(address)) return NATIVE_TRX;
    return this.liquidity.tokenFacts(network, address, requestDispatchCheck(deadline));
  }

  // The API fee is in whole input tokens; scale it to base units.
  #publishRoute(
    route: RouterRoute,
    tokenIn: { decimals: number; symbol: string },
    tokenOut: { decimals: number },
  ): Record<string, unknown> {
    // Bind decimals by hop position; different contracts can share a symbol.
    const last = route.path.length - 1;
    return {
      amountIn: route.amountInRaw,
      amountOut: route.amountOutRaw,
      ...(route.inUsd === undefined ? {} : { inUsd: route.inUsd }),
      ...(route.outUsd === undefined ? {} : { outUsd: route.outUsd }),
      // Negative impact means a better price than the reference; preserve it.
      priceImpactPercent: route.priceImpactPercent,
      tradingFee: toBaseUnits(route.fee, tokenIn.decimals, tokenIn.symbol, "fee"),
      containsUnverifiedHook: route.containsUnverifiedHook,
      // Intermediate tokens have unknown decimals; do not invent a scale.
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

  async #chooseMarket(
    deadline: ExecutionDeadline,
    network: NetworkDescriptor,
    inAddress: string,
    outAddress: string,
  ): Promise<SwapMarket> {
    const natives = [inAddress, outAddress].filter(isNative).length;
    if (natives !== 1) return "sunswap";
    // No configured launchpad means no curve; a failed curve read still aborts.
    if (!this.#hasLaunchpad(network)) return "sunswap";
    const other = isNative(inAddress) ? outAddress : inAddress;
    const state = await this.#curveState(deadline, network, other);
    return state === LAUNCHPAD_STATE.TRADING ? "sunpump" : "sunswap";
  }

  #hasLaunchpad(network: NetworkDescriptor): boolean {
    try {
      return Boolean(this.launchpad.launchpadAddress(network));
    } catch {
      // The port throws when the network has no configured launchpad.
      return false;
    }
  }

  // A failed probe leaves the market unknown; do not fall back to another market.
  async #curveState(
    deadline: ExecutionDeadline,
    network: NetworkDescriptor,
    token: string,
  ): Promise<number> {
    try {
      return await this.launchpad.tokenState(network, token, requestDispatchCheck(deadline));
    } catch (error) {
      if (error instanceof UsageError || endedByDeadline(error, deadline)) throw error;
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
    const facts = await this.launchpad.tokenFacts(
      network,
      tokenAddress,
      requestDispatchCheck(scope.deadline),
    );
    const tokenIn = buying ? NATIVE_TRX : published(facts);
    const tokenOut = buying ? published(facts) : NATIVE_TRX;

    const amountIn = buying
      ? toBaseUnits(input.amountIn, FAMILIES.tron.nativeDecimals, "TRX", "<amountIn>")
      : toBaseUnits(input.amountIn, facts.decimals, facts.symbol, "<amountIn>");

    // Both expected outputs are net of the platform fee.
    const quoted = buying
      ? await this.launchpad
          .quoteBuy(
            network,
            tokenAddress,
            sunAmount(amountIn),
            requestDispatchCheck(scope.deadline),
          )
          .then((q) => ({ expected: q.tokenAmount, feeSun: q.feeSun }))
      : await quoteCurveSale(
          scope.deadline,
          this.launchpad,
          network,
          facts,
          baseUnitAmount(amountIn),
        ).then((q) => ({
          expected: q.trxOutSun,
          feeSun: q.feeSun,
        }));
    const expected = quoted.expected;
    if (buying && BigInt(expected) <= 0n) {
      throw new UsageError("invalid_amount", `${input.amountIn} TRX buys no ${facts.symbol}`);
    }

    const path = [
      { address: tokenIn.address, symbol: tokenIn.symbol, decimals: tokenIn.decimals },
      { address: tokenOut.address, symbol: tokenOut.symbol, decimals: tokenOut.decimals },
    ];
    const route = {
      path,
      protocols: ["SUNPUMP"],
      poolFees: ["0", "0"],
    };

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
            // SunPump platform fee in SUN.
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

    const floor = selectFloor(input.slippage, input.minOut, DEFAULT_SWAP_SLIPPAGE);
    const minimum =
      floor.kind === "min-out" ? floor.amount : this.launchpad.applyFloor(expected, floor.bips);
    assertQuoteMeetsFloor(expected, minimum);
    const priced = {
      ...view,
      amountOutExpected: expected,
      amountOutMinimum: minimum,
      ...(floor.kind === "slippage" ? { slippage: bipsToSlippage(floor.bips) } : {}),
    };

    const owner = resolveTronAccount(scope);
    const account = await activeTronAccount(scope.deadline, this.gateways, network, owner);
    if (buying) {
      const held = String(account.balance ?? "0");
      if (BigInt(held) < BigInt(amountIn)) {
        throw new ChainError(
          "insufficient_balance",
          `this swap spends ${amountIn} SUN and the account holds ${held}`,
        );
      }
    }
    const payload = buying
      ? this.launchpad.buyPayload(network, {
          token: tokenAddress,
          trxSun: sunAmount(amountIn),
          minTokenAmount: baseUnitAmount(minimum),
        })
      : this.launchpad.sellPayload(network, {
          token: tokenAddress,
          tokenAmount: baseUnitAmount(amountIn),
          minTrxSun: sunAmount(minimum),
        });

    const approvals = buying
      ? []
      : await this.#sellApprovals(scope.deadline, network, owner, facts, amountIn);

    return this.#execute(scope, network, input, payload, approvals, {
      ...priced,
      account: owner,
    });
  }

  // Check funds before requesting the launchpad's standing unlimited allowance.
  async #sellApprovals(
    deadline: ExecutionDeadline,
    network: NetworkDescriptor,
    owner: string,
    facts: LaunchpadTokenFacts,
    amountIn: string,
  ): Promise<ApprovalPlan[]> {
    const held = await this.launchpad.balanceOf(
      network,
      facts.address,
      owner,
      requestDispatchCheck(deadline),
    );
    if (BigInt(held) < BigInt(amountIn)) {
      throw new ChainError(
        "insufficient_token_balance",
        `this swap sells ${amountIn} of ${facts.symbol} in base units and the account holds ${held}`,
      );
    }
    return this.tx.planApprovals(
      deadline,
      network,
      owner,
      this.launchpad.launchpadAddress(network),
      [{ facts, amount: UNLIMITED_ALLOWANCE }],
    );
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
        ...(approvals.length === 0 ? {} : { approvals: approvals.map(publishedApproval) }),
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
            input.tokenOut,
            resolveTronAccount(scope),
            "amountOut",
          )),
        };
      },
    );
  }
}

// A floor above the quote must revert on chain; refuse before any approval or signature.
function assertQuoteMeetsFloor(expected: string, minimum: string): void {
  if (BigInt(expected) >= BigInt(minimum)) return;
  throw new ChainError(
    "slippage_exceeded",
    errorMessage`the quoted output ${expected} is below ${inputRef("minOut")} ${minimum}, in the output token's base units`,
    { amountOutExpected: expected, amountOutMinimum: minimum },
  );
}

// Check the SDK's permit domain against the independent network descriptor.
function chainIdOf(network: NetworkDescriptor): string {
  const id = (network as { chainId?: unknown }).chainId;
  if (typeof id === "string" && /^\d+$/.test(id)) return id;
  throw new ChainError(
    "provider_error",
    `network ${network.id} carries no numeric chain id, so a Permit2 domain cannot be checked against it`,
  );
}

const NATIVE_TRX = {
  address: NATIVE_TRX_ADDRESS,
  symbol: "TRX",
  decimals: FAMILIES.tron.nativeDecimals,
} as const;

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
    amount: approval.isUnlimited ? "unlimited" : approval.amount,
    isUnlimited: approval.isUnlimited,
    symbol: approval.symbol,
    decimals: approval.decimals,
  };
}

function isNative(address: string): boolean {
  return address === NATIVE_TRX_ADDRESS;
}
