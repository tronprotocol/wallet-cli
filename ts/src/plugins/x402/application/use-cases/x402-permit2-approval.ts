import type { NetworkDescriptor, TxOutcome } from "../../../../plugin-api/domain.js";
import {
  ChainError,
  CliError,
  errorMessage,
  ExecutionError,
  sunAmount,
  UNLIMITED_ALLOWANCE,
  UsageError,
} from "../../../../plugin-api/domain.js";
import type {
  ContractParameter,
  PluginTronCalls,
  TransactionScope,
} from "../../../../plugin-api/application.js";
import type {
  Permit2ApproveRequest,
  Permit2Approver,
  SignedApproval,
  X402PaymentFacts,
} from "../contracts/x402-payer.js";
import { X402_APPROVE_FEE_LIMIT_SUN } from "../services/payer-policy.js";

const APPROVE = "approve(address,uint256)";

// The payment is signed only after the approval is confirmed and the allowance has landed.
export class X402Permit2Approvals {
  constructor(private readonly calls: PluginTronCalls) {}

  approver(
    scope: TransactionScope,
    network: NetworkDescriptor,
    facts: X402PaymentFacts,
  ): Permit2Approver {
    return { approve: (request) => this.#approve(scope, network, facts, request) };
  }

  async #approve(
    scope: TransactionScope,
    network: NetworkDescriptor,
    facts: X402PaymentFacts,
    request: Permit2ApproveRequest,
  ): Promise<SignedApproval> {
    const permit2 = facts.permit2;
    if (
      network.family !== "tron" ||
      !permit2 ||
      request.spender !== permit2.spender ||
      !permit2.tokens.includes(request.token)
    ) {
      throw new ChainError(
        "signed_payload_mismatch",
        "x402 requested an approve outside the Permit2 payment policy; nothing was signed or sent",
      );
    }
    const parameters: ContractParameter[] = [
      { type: "address", value: request.spender },
      { type: "uint256", value: UNLIMITED_ALLOWANCE },
    ];
    const approvalScope = waitingScope(scope);
    scope.emit({ type: "activity", message: "Sending the one-time Permit2 approval…" });
    let outcome: TxOutcome;
    try {
      // The approval may have been sent once its broadcast passes the dispatch check, which runs right
      // before the request leaves. Earlier failures leave nothing sent.
      outcome = await this.calls.run(
        approvalScope,
        network,
        { target: request.token, method: APPROVE, parameters },
        {
          mode: { mode: "broadcast", permissionId: 0 },
          estimable: true,
          feeLimit: sunAmount(String(X402_APPROVE_FEE_LIMIT_SUN)),
          confirmationRequired: true,
          onDispatched: (txId) => request.onSubmitted(txId),
        },
      );
    } catch (error) {
      throw sentApprovalError(error);
    }
    const txId = outcomeTxId(outcome);
    const evidence = txId === undefined ? undefined : { txId };
    if (outcome.stage === "failed") {
      const result = typeof outcome.result === "string" ? ` (${outcome.result})` : "";
      throw new ChainError(
        "execution_reverted",
        `the Permit2 approval failed on chain${result}; no payment was signed`,
        evidence,
      );
    }
    // Only the deadline leaves an approval submitted; it may still confirm, but the payment cannot be
    // verified without it.
    if (outcome.stage !== "confirmed" || txId === undefined) {
      throw new ChainError(
        "timeout",
        `the Permit2 approval was not confirmed before the command's time limit; no payment was signed; the approval may still confirm on chain`,
        evidence && { ...evidence, outcome: "unknown" },
      );
    }
    const approval: SignedApproval = {
      txId,
      token: request.token,
      spender: request.spender,
      allowance: "unlimited",
      feeLimitSun: X402_APPROVE_FEE_LIMIT_SUN,
    };
    request.onConfirmed(approval);
    // A successful receipt does not guarantee the allowance was granted.
    const allowance = await request.readAllowance();
    if (BigInt(allowance) < BigInt(request.requiredAllowance)) {
      throw new ChainError(
        "execution_reverted",
        `the Permit2 approval confirmed but left an allowance of ${allowance}, below the ${request.requiredAllowance} this payment needs`,
        { txId },
      );
    }
    return approval;
  }
}

// An error after the approval was sent (its wait stopped, or its outcome is unknown) names the
// approval like the deadline case does, so its txId is not read as the payment.
function sentApprovalError(error: unknown): unknown {
  if (!(error instanceof CliError)) return error;
  const txId = (error.details as { txId?: unknown } | undefined)?.txId;
  if (typeof txId !== "string") return error;
  const ErrorType = error.kind === "usage" ? UsageError : ExecutionError;
  return new ErrorType(
    error.code,
    errorMessage`the Permit2 approval ${txId} failed with ${error.code} (${error.userMessage}) after it was sent; no payment was signed; the approval may still confirm on chain`,
    error.details,
  );
}

function outcomeTxId(outcome: TxOutcome): string | undefined {
  return "txId" in outcome && typeof outcome.txId === "string" ? outcome.txId : undefined;
}

// Explicit forwarding preserves scope getters and prototype methods.
function waitingScope(scope: TransactionScope): TransactionScope {
  return {
    get activeAccount() {
      return scope.activeAccount;
    },
    deadline: scope.deadline,
    wait: true,
    resolveAddress: (family) => scope.resolveAddress(family),
    emit: (event) => scope.emit(event),
    warn: (message) => scope.warn(message),
  };
}
