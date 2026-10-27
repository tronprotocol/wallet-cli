import { resolveTronAccount } from "../../../services/tron-account.js";
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

// 100 TRX in SUN.
export const DEFAULT_FEE_LIMIT_SUN = "100000000";

export interface ApprovalPlan {
  readonly token: string;
  readonly symbol: string;
  readonly decimals: number;
  readonly spender: string;
  // Base units; may be unlimited.
  readonly amount: string;
  // Base units.
  readonly currentAllowance: string;
}

export type FeeCoverage = "all" | "approvals" | "none";

export interface SideAmount {
  // Base units to grant when allowance is insufficient; defaults to amount.
  readonly approvalAmount?: string;
  readonly facts: TokenFacts;
  readonly amount: string;
}

const FEE_NOT_YET_ESTIMABLE: FeeReport = {
  feeModel: "tron-resource",
  note: "not estimable until the approval is on-chain",
};

// Bind approval construction and allowance reads to the same protocol.
export class LiquidityTransactions<D extends ApprovalDomain = ApprovalDomain> {
  constructor(
    private readonly liquidity: ApprovalCapablePort & { readonly approvalDomain: D },
    private readonly gateways: ChainGatewayProvider,
    private readonly pipeline: TxPipeline,
  ) {}

  assertCanSign(scope: TransactionScope): void {
    this.pipeline.assertCanSign(scope.activeAccount, "tron");
  }

  // Pending approvals prevent building or estimating the main call in a dry run.
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

  // Returned transactions must be signed and broadcast in order.
  async buildOnly(
    scope: TransactionScope,
    network: NetworkDescriptor,
    approvals: readonly ApprovalPlan[],
    main: ContractCallPayload,
    mode: ResolvedTransactionMode,
    feeLimit: string | undefined,
  ): Promise<Record<string, unknown>> {
    // Allow time for offline approval signing and confirmation; preserve explicit expiration.
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

  // Confirm and re-read each approval before sending dependent transactions.
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
    // Always await approvals; explicit forwarding preserves scope getters and prototype methods.
    const approvalScope: TransactionScope =
      mode.mode === "broadcast"
        ? {
            get activeAccount() {
              return scope.activeAccount;
            },
            timeoutMs: scope.timeoutMs,
            wait: true,
            waitTimeoutMs: scope.waitTimeoutMs,
            resolveAddress: (family) => scope.resolveAddress(family),
            emit: (event) => scope.emit(event),
            warn: (message) => scope.warn(message),
          }
        : scope;
    try {
      for (const approval of approvals) {
        const outcome = await this.run(
          approvalScope,
          network,
          this.approvalPayload(network, approval),
          {
            mode,
            estimable: true,
            feeLimit,
          },
        );
        const txId = outcomeTxId(outcome);
        if (txId) txIds.push(txId);
        if (outcome.stage === "failed") {
          const result = typeof outcome.result === "string" ? ` (${outcome.result})` : "";
          throw new ChainError(
            "execution_reverted",
            `the approval for ${approval.symbol} failed on chain${result}; the main transaction was not sent`,
          );
        }
        // A submitted approval may still time out; dependent calls require confirmation.
        if (mode.mode === "broadcast" && outcome.stage !== "confirmed") {
          throw new ChainError(
            "timeout",
            `the approval for ${approval.symbol} was not confirmed within ${scope.waitTimeoutMs}ms; the main transaction was not sent; the approval may still confirm on chain`,
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
      // Check signer membership before signing; enforce the combined threshold before broadcast.
      preflight: (tx, signer) => assertTronSignerAuthorized(gateway, tx, signer),
      confirm: tronConfirmation(gateway, scope, { requireReceiptResult: true }),
      build: async (from) =>
        gateway.triggerSmartContract(
          from,
          payload.target,
          payload.method,
          [...payload.parameters],
          {
            // The node requires both fields, including zero call value for token-only calls.
            callValue: payload.callValueSun ?? "0",
            feeLimit: options.feeLimit ?? DEFAULT_FEE_LIMIT_SUN,
            permissionId: 0,
          },
        ),
      estimate: this.#estimatorFor(scope, network, payload, options.estimable),
    });
  }

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

  // Estimation simulates execution and reverts until required allowances are on-chain.
  #estimatorFor(
    scope: TransactionScope,
    network: NetworkDescriptor,
    payload: ContractCallPayload,
    estimable: boolean,
  ): () => Promise<FeeReport> {
    if (!estimable) return async () => FEE_NOT_YET_ESTIMABLE;
    const gateway = this.gateways.get(network, "tron");
    return async () =>
      gateway.estimateResources(
        resolveTronAccount(scope),
        payload.target,
        payload.method,
        [...payload.parameters],
        payload.callValueSun,
      );
  }

  // A successful approval receipt does not guarantee the requested allowance was granted.
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

export function withPositionManager<T extends { readonly router: string }>(
  view: T,
): Omit<T, "router"> & { positionManager: string } {
  const { router, ...rest } = view;
  return { ...rest, positionManager: router };
}

export function outcomeTxId(outcome: TxOutcome): string | undefined {
  return "txId" in outcome && typeof outcome.txId === "string" ? outcome.txId : undefined;
}

export function outcomeFee(outcome: TxOutcome): FeeReport {
  return outcome.stage === "plan" || outcome.stage === "built"
    ? outcome.fee
    : FEE_NOT_YET_ESTIMABLE;
}

function builtTx(outcome: TxOutcome): Record<string, unknown> {
  return outcome.stage === "built" ? { tx: outcome.tx, hex: outcome.hex } : {};
}

// Sum energy only; price and reserve apply to the account and must not be summed.
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
