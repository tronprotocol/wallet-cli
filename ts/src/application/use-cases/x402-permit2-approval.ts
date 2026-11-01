import { requestDispatchCheck } from "../services/command-deadline.js";
import type { NetworkDescriptor, TxOutcome } from "../../domain/types/index.js";
import { ChainError } from "../../domain/errors/index.js";
import { sunAmount } from "../../domain/amounts/index.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type {
  Permit2ApproveRequest,
  Permit2Approver,
  SignedApproval,
  X402PaymentFacts,
} from "../contracts/x402-payer.js";
import type { ChainGatewayProvider } from "../ports/chain/gateway-provider.js";
import type { TronContractParameter } from "../ports/chain/tron/tron-gateway.js";
import type { TxPipeline } from "../services/pipeline/index.js";
import { resolveTronAccount } from "../services/tron/tron-account.js";
import { tronConfirmation } from "../services/tron/tron-confirmation.js";
import { X402_APPROVE_FEE_LIMIT_SUN } from "../services/x402/payer-policy.js";
import { assertTronSignerAuthorized, tronTransactionHooks } from "./tron/multisig-authorization.js";
import { UNLIMITED_ALLOWANCE } from "../../domain/token/allowance.js";

const APPROVE = "approve(address,uint256)";

// The payment is signed only after the approval is confirmed and the allowance has landed.
export class X402Permit2Approvals {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly pipeline: TxPipeline,
  ) {}

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
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline));
    const owner = resolveTronAccount(scope);
    const parameters: TronContractParameter[] = [
      { type: "address", value: request.spender },
      { type: "uint256", value: UNLIMITED_ALLOWANCE },
    ];
    const approvalScope = waitingScope(scope);
    scope.emit({ type: "activity", message: "Sending the one-time Permit2 approval…" });
    const outcome = await this.pipeline.runTron({
      ctx: approvalScope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      mode: "broadcast",
      permissionId: 0,
      ...tronTransactionHooks(gateway),
      preflight: (tx, signer) => assertTronSignerAuthorized(gateway, tx, signer),
      confirm: tronConfirmation(gateway, approvalScope),
      build: (from) =>
        gateway.triggerSmartContract(from, request.token, APPROVE, parameters, {
          callValue: sunAmount("0"),
          feeLimit: sunAmount(String(X402_APPROVE_FEE_LIMIT_SUN)),
          permissionId: 0,
        }),
      estimate: () => gateway.estimateResources(owner, request.token, APPROVE, parameters),
    });
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
    // A submitted approval may still confirm; the payment cannot be verified without it.
    if (outcome.stage !== "confirmed" || txId === undefined) {
      throw new ChainError(
        "timeout",
        `the Permit2 approval was not confirmed before the command's time limit; no payment was signed; the approval may still confirm on chain`,
        evidence,
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
