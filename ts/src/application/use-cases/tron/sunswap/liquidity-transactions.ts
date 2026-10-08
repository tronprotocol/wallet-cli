import { resolveTronAccount } from "../../../services/tron-account.js";
/**
 * The transaction mechanics the SunSwap liquidity commands share.
 *
 * Adding liquidity and removing it mean opposite things, and almost nothing about WHAT they mean
 * is shared. What is shared is how a TRON contract call gets made: the pipeline, the estimate
 * gate, the approval sequence, the balance checks, and the three non-broadcast modes. This is
 * that plumbing, and nothing else — a deposit's rules stay with deposits, a withdrawal's with
 * withdrawals.
 *
 * The rules it enforces, all of them properties of moving money on TRON rather than of either
 * command:
 *
 * - Every transaction goes through `TxPipeline`, so `--dry-run`, permissions, confirmation and
 *   the receipt shape are the ones the rest of the CLI already guarantees.
 * - An approval and the call that spends it are SEQUENTIAL and confirmed: approve, wait, re-read
 *   the allowance from the chain, then the call. Firing both and hoping the node orders them is
 *   how an approval lands second and the call reverts having spent a fee.
 * - A call whose preconditions do not yet hold is NOT estimated. See `#estimatorFor`.
 */
import type { FeeReport, NetworkDescriptor, TxOutcome } from "../../../../domain/types/index.js";
import type { TransactionScope } from "../../../contracts/execution-scope.js";
import type { TokenFacts } from "../../../ports/sunswap/liquidity.js";
import type {
  ApprovalCapablePort,
  ContractCallPayload,
  ApprovalDomain,
} from "../../../contracts/tron-contract-call.js";
import type { ChainGatewayProvider } from "../../../ports/chain/gateway-provider.js";
import type { TxPipeline } from "../../../services/pipeline/index.js";
import { outcomeData, type ResolvedTransactionMode } from "../../../services/transaction-mode.js";
import { tronConfirmation } from "../../../services/tron-confirmation.js";
import { assertTronSignerAuthorized, tronTransactionHooks } from "../multisig-authorization.js";
import {
  ChainError,
  classifyError,
  ExecutionError,
  UsageError,
} from "../../../../domain/errors/index.js";

/** The cap a TRON contract call burns at when the caller names none, in SUN — 100 TRX, the same
 *  default `contract send` and the ERC-8004 writes use. */
export const DEFAULT_FEE_LIMIT_SUN = "100000000";

export interface ApprovalPlan {
  readonly token: string;
  readonly symbol: string;
  readonly decimals: number;
  readonly spender: string;
  /** Base units to grant; some protocols request an unlimited allowance. */
  readonly amount: string;
  /** what the spender may already move, for a reader deciding whether this is expected. */
  readonly currentAllowance: string;
}

/**
 * How much of a command's cost the reported `fee` accounts for.
 *
 * `"all"` is the whole operation. `"approvals"` is the approvals alone, because the call itself
 * cannot be priced until they are on-chain. The key exists so a script can tell the two apart
 * without reading the English the text mode prints.
 */
export type FeeCoverage = "all" | "approvals" | "none";

/** One side of a pair, and how much of it this command needs. */
export interface SideAmount {
  /** Grant policy when the existing allowance is below amount. */
  readonly approvalAmount?: string;
  readonly facts: TokenFacts;
  readonly amount: string;
}

/**
 * The fee of a call that cannot be priced yet.
 *
 * It is a report, not a missing key: this transaction does have a cost, and an absent `fee`
 * reads as "free". `formatFee` renders `note` verbatim, so nothing downstream needs to learn a
 * new shape.
 */
const FEE_NOT_YET_ESTIMABLE: FeeReport = {
  feeModel: "tron-resource",
  note: "not estimable until the approval is on-chain",
};

/**
 * The transaction mechanics, over any port that can approve.
 *
 * Typed against the two members the approval sequence actually uses rather than against a whole
 * protocol port, because the sequence is identical whether the spender is a SunSwap router or a
 * SunPump proxy. Every existing caller satisfies it structurally, so nothing had to change to
 * share it.
 */
/**
 * The approve/confirm/re-read sequence, bound to ONE protocol's contracts.
 *
 * The type parameter is not decoration. The sequence reads an allowance back through the same port
 * it approved with, so the port and the contracts have to belong together — and structural typing
 * alone let a SunSwap swap be built on the SunPump launchpad port, which compiled and then asked the
 * wrong protocol about a Permit2 allowance. Declaring the domain a caller expects turns that into a
 * compile error.
 */
export class LiquidityTransactions<D extends ApprovalDomain = ApprovalDomain> {
  constructor(
    private readonly liquidity: ApprovalCapablePort & { readonly approvalDomain: D },
    private readonly gateways: ChainGatewayProvider,
    private readonly pipeline: TxPipeline,
  ) {}

  assertCanSign(scope: TransactionScope): void {
    this.pipeline.assertCanSign(scope.activeAccount, "tron");
  }

  /**
   * The `fee` a `--dry-run` reports, and what it covers.
   *
   * With the allowances already in place the call is priced for real. With an approval still
   * pending it is not priced at all — the approvals are, and `feeCovers` says so. The main
   * transaction is not even built here: building it is a node round trip whose behaviour before
   * the allowance exists is exactly what a dry run must not depend on.
   */
  async priceWithoutSending(
    scope: TransactionScope,
    network: NetworkDescriptor,
    approvals: readonly ApprovalPlan[],
    main: ContractCallPayload,
    mode: ResolvedTransactionMode,
    feeLimit: string | undefined,
  ): Promise<{ fee: FeeReport; feeCovers: FeeCoverage }> {
    if (approvals.length === 0) {
      const outcome = await this.run(scope, network, main, { mode, estimable: true, feeLimit });
      return { fee: outcomeFee(outcome), feeCovers: "all" };
    }
    const fees: FeeReport[] = [];
    for (const approval of approvals) {
      const outcome = await this.run(scope, network, this.approvalPayload(network, approval), {
        mode,
        estimable: true,
        feeLimit,
      });
      fees.push(outcomeFee(outcome));
    }
    return { fee: sumEnergyFees(fees), feeCovers: "approvals" };
  }

  /**
   * The approvals priced on their own, with no main transaction to price beside them.
   *
   * `priceWithoutSending` needs a main payload even when it never uses one, and a router swap's main
   * payload does not exist until its Permit2 signature does. Passing an unused placeholder would be
   * a lie waiting for someone to start using it.
   */
  async priceApprovals(
    scope: TransactionScope,
    network: NetworkDescriptor,
    approvals: readonly ApprovalPlan[],
    mode: ResolvedTransactionMode,
    feeLimit: string | undefined,
  ): Promise<{ fee: FeeReport; feeCovers: FeeCoverage; feeUnavailableReason: string }> {
    const fees: FeeReport[] = [];
    for (const approval of approvals) {
      const outcome = await this.run(scope, network, this.approvalPayload(network, approval), {
        mode,
        estimable: true,
        feeLimit,
      });
      fees.push(outcomeFee(outcome));
    }
    const reason =
      "the main transaction cannot be estimated until the Permit2 authorization is signed";
    return {
      fee: fees.length ? sumEnergyFees(fees) : { feeModel: "tron-resource", note: reason },
      feeCovers: fees.length ? "approvals" : "none",
      feeUnavailableReason: reason,
    };
  }

  /**
   * `--build-only`: the unsigned transactions, in the order a caller must send them.
   *
   * One approval-free call keeps the ordinary single-transaction shape every other
   * `--build-only` produces. With approvals it becomes `transactions[]`, because the
   * caller has to sign and broadcast them in order and a single transaction cannot say that.
   */
  async buildOnly(
    scope: TransactionScope,
    network: NetworkDescriptor,
    approvals: readonly ApprovalPlan[],
    main: ContractCallPayload,
    mode: ResolvedTransactionMode,
    feeLimit: string | undefined,
  ): Promise<Record<string, unknown>> {
    // Leave enough time to sign, confirm and re-read a sequence of offline approvals.
    // An explicit --expiration always wins; signed artifacts are never refreshed.
    if (approvals.length > 0) mode = { ...mode, expiration: mode.expiration ?? 3_600_000 };
    const built: TxOutcome[] = [];
    for (const approval of approvals) {
      built.push(
        await this.run(scope, network, this.approvalPayload(network, approval), {
          mode,
          estimable: true,
          feeLimit,
        }),
      );
    }
    const outcome = await this.run(scope, network, main, {
      mode,
      // The call cannot be priced while an approval is still only a plan.
      estimable: approvals.length === 0,
      feeLimit,
    });

    if (approvals.length === 0) {
      return { ...outcomeData(outcome), feeCovers: "all" satisfies FeeCoverage };
    }
    return {
      mode: "build-only",
      transactions: [
        ...built.map((entry) => ({ purpose: "approval" as const, ...builtTx(entry) })),
        { purpose: "main" as const, ...builtTx(outcome) },
      ],
      fee: sumEnergyFees(built.map(outcomeFee)),
      feeCovers: "approvals" satisfies FeeCoverage,
    };
  }

  /**
   * Send the approvals, one at a time, each confirmed and re-read before the next.
   *
   * An approve and the call that spends it cannot be sent together: the node may order them
   * either way, and the wrong order reverts the call after the approval's fee has been spent.
   */
  async withApprovals<T>(
    scope: TransactionScope,
    network: NetworkDescriptor,
    approvals: readonly ApprovalPlan[],
    owner: string,
    mode: ResolvedTransactionMode,
    feeLimit: string | undefined,
    action: (approvalTxIds: string[]) => Promise<T>,
  ): Promise<T> {
    const txIds = await this.sendApprovals(scope, network, approvals, owner, mode, feeLimit);
    try {
      return await action(txIds);
    } catch (error) {
      throw approvalProgressError(error, txIds);
    }
  }

  async sendApprovals(
    scope: TransactionScope,
    network: NetworkDescriptor,
    approvals: readonly ApprovalPlan[],
    owner: string,
    mode: ResolvedTransactionMode,
    feeLimit: string | undefined,
  ): Promise<string[]> {
    const txIds: string[] = [];
    try {
      for (const approval of approvals) {
        const outcome = await this.run(scope, network, this.approvalPayload(network, approval), {
          mode,
          // An approval is a plain ERC-20 `approve`; it has no precondition of its own, so it is
          // always priceable.
          estimable: true,
          feeLimit,
        });
        const txId = outcomeTxId(outcome);
        if (txId) txIds.push(txId);
        // A receipt that says the approval failed is the reason, and it is reported as such:
        // re-reading the allowance would only add "it left 0", which reads as a confirmed approve.
        if (outcome.stage === "failed") {
          const result = typeof outcome.result === "string" ? ` (${outcome.result})` : "";
          throw new ChainError(
            "execution_reverted",
            `the approval for ${approval.symbol} failed on chain${result}; the main transaction was not sent`,
          );
        }
        await this.#assertAllowanceLanded(network, approval, owner);
      }
    } catch (error) {
      throw approvalProgressError(error, txIds);
    }
    return txIds;
  }

  async run(
    scope: TransactionScope,
    network: NetworkDescriptor,
    payload: ContractCallPayload,
    options: { mode: ResolvedTransactionMode; estimable: boolean; feeLimit?: string },
  ): Promise<TxOutcome> {
    const gateway = this.gateways.get(network, "tron");
    return this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...options.mode,
      ...tronTransactionHooks(gateway),
      // The same authorization gate every other TRON write uses: it asks whether the selected
      // key's weight reaches the account's threshold, and the pipeline consults the gate it
      // returns again before broadcasting. So a joint-signature account is refused locally
      // instead of having an under-signed transaction rejected by the node.
      preflight: (tx, signer) => assertTronSignerAuthorized(gateway, tx, signer),
      confirm: tronConfirmation(gateway, scope, { requireReceiptResult: true }),
      build: async (from) =>
        gateway.triggerSmartContract(
          from,
          payload.target,
          payload.method,
          [...payload.parameters],
          {
            // Both are always sent: the node refuses a build with either missing, and "0" is the
            // honest value for a pure token call that carries no TRX.
            callValue: payload.callValueSun ?? "0",
            feeLimit: options.feeLimit ?? DEFAULT_FEE_LIMIT_SUN,
            permissionId: 0,
          },
        ),
      estimate: this.#estimatorFor(scope, network, payload, options.estimable),
    });
  }

  /** One approval per side that needs one, for exactly the amount, to `spender`. */
  async planApprovals(
    network: NetworkDescriptor,
    owner: string,
    spender: string,
    sides: readonly SideAmount[],
  ): Promise<ApprovalPlan[]> {
    const approvals: ApprovalPlan[] = [];
    for (const side of sides) {
      const current = await this.liquidity.allowance(network, side.facts.address, owner, spender);
      if (BigInt(current) >= BigInt(side.amount)) continue;
      approvals.push({
        token: side.facts.address,
        symbol: side.facts.symbol,
        decimals: side.facts.decimals,
        spender,
        amount: side.approvalAmount ?? side.amount,
        currentAllowance: current,
      });
    }
    return approvals;
  }

  approvalPayload(network: NetworkDescriptor, approval: ApprovalPlan): ContractCallPayload {
    return this.liquidity.approvalPayload(
      network,
      approval.token,
      approval.spender,
      approval.amount,
    );
  }

  /**
   * The estimate hook, or a refusal to estimate — decided by the PAYLOAD's preconditions, not by
   * the mode that asked.
   *
   * A TRON estimate is `triggerConstantContract`: it SIMULATES the call. A call whose allowance
   * is not on-chain yet cannot be pulled from, so the simulation reverts and the client raises —
   * measured on Nile, TronWeb throws `REVERT opcode executed` rather than returning the energy
   * burned reaching it.
   *
   * So the cost of estimating a call whose preconditions do not hold is not a wrong number, it is
   * no answer at all: `--dry-run` and `--build-only` would fail with an opaque rpc_error instead
   * of showing the plan the caller asked for. `TxPipeline` estimates before it branches on mode,
   * so gating here rather than at each consumer is what keeps every mode answering — including
   * ones nobody has written yet.
   *
   * A revert for any OTHER reason is left to surface. A dry run exists to find out that a
   * transaction would fail, and swallowing that into a note would defeat it.
   */
  #estimatorFor(
    scope: TransactionScope,
    network: NetworkDescriptor,
    payload: ContractCallPayload,
    estimable: boolean,
  ): () => Promise<FeeReport> {
    if (!estimable) return async () => FEE_NOT_YET_ESTIMABLE;
    const gateway = this.gateways.get(network, "tron");
    // A constant call, so it needs no key and runs on the watch-only paths too.
    return async () =>
      gateway.estimateResources(
        resolveTronAccount(scope),
        payload.target,
        payload.method,
        [...payload.parameters],
        payload.callValueSun,
      );
  }

  /**
   * Re-read the allowance from the chain after the approval confirmed.
   *
   * The receipt says the transaction succeeded; it does not say the allowance is what we asked
   * for. A token with a non-standard `approve` — one that refuses a change from a non-zero value,
   * or caps what it grants — succeeds and leaves a different number behind, and the call that
   * follows then reverts for a reason nothing in the receipt explains.
   */
  async #assertAllowanceLanded(
    network: NetworkDescriptor,
    approval: ApprovalPlan,
    owner: string,
  ): Promise<void> {
    const now = await this.liquidity.allowance(network, approval.token, owner, approval.spender);
    if (BigInt(now) < BigInt(approval.amount)) {
      throw new ChainError(
        "execution_reverted",
        `the approval for ${approval.symbol} confirmed but left an allowance of ${now}, below the ${approval.amount} this call needs`,
      );
    }
  }
}

/**
 * A V3 / V4 plan as it is published: the contract is `positionManager`, in every mode.
 * `router` is V2's word for its own contract, and only V2 keeps it. The plans carry it as `router`
 * internally because one field serves all three protocols.
 */
export function withPositionManager<T extends { readonly router: string }>(
  view: T,
): Omit<T, "router"> & { positionManager: string } {
  const { router, ...rest } = view;
  return { ...rest, positionManager: router };
}

export function outcomeTxId(outcome: TxOutcome): string | undefined {
  return "txId" in outcome && typeof outcome.txId === "string" ? outcome.txId : undefined;
}

/** Only `plan` and `built` carry a typed `fee`, and they are the only stages priced here; a
 *  broadcast stage reports what the chain charged, not an estimate. */
export function outcomeFee(outcome: TxOutcome): FeeReport {
  return outcome.stage === "plan" || outcome.stage === "built"
    ? outcome.fee
    : FEE_NOT_YET_ESTIMABLE;
}

/** What one element of `--build-only`'s `transactions[]` carries, plus the hex the
 *  single-transaction shape has always given, because a caller has to broadcast these. */
function builtTx(outcome: TxOutcome): Record<string, unknown> {
  return outcome.stage === "built" ? { tx: outcome.tx, hex: outcome.hex } : {};
}

/**
 * One fee for several transactions that will all be sent.
 *
 * TRON prices a contract call in energy, and energy adds up; the price per unit and the account's
 * own reserve are properties of the account and the network, not of the call, so they carry
 * across unchanged. If any part could not be priced, the total cannot be either — saying so
 * beats publishing a sum that silently omits one of its terms.
 */
export function sumEnergyFees(fees: readonly FeeReport[]): FeeReport {
  if (fees.length === 0) return FEE_NOT_YET_ESTIMABLE;
  let energy = 0;
  for (const fee of fees) {
    if (typeof fee.energy !== "number") return FEE_NOT_YET_ESTIMABLE;
    energy += fee.energy;
  }
  const first = fees[0] as FeeReport;
  return {
    feeModel: "tron-resource",
    energy,
    ...(first.energyPriceSun === undefined ? {} : { energyPriceSun: first.energyPriceSun }),
    ...(first.availableEnergy === undefined ? {} : { availableEnergy: first.availableEnergy }),
  };
}

/** Preserve the original classification, redaction and details while reporting partial progress. */
function approvalProgressError(error: unknown, approvalTxIds: readonly string[]): unknown {
  if (approvalTxIds.length === 0) return error;
  const classified = classifyError(error);
  const ErrorType = classified.kind === "usage" ? UsageError : ExecutionError;
  return new ErrorType(
    classified.code,
    `${classified.message}; approval transactions already submitted: ${approvalTxIds.join(", ")}`,
    {
      ...classified.details,
      approvalTxIds: [...approvalTxIds],
    },
  );
}
