import type {
  BaiCreateOrderInput,
  BaiRechargeApi,
  BaiRechargePayment,
  BaiReportTransactionInput,
} from "../ports/bai-recharge.js";
import { UsageError, TransportError } from "../../domain/errors/index.js";

/** Internal orchestration after target resolution and wallet binding. No implicit payment retries. */
export class BaiRechargeFlow {
  constructor(
    private readonly api: Pick<BaiRechargeApi, "createOrder" | "reportTxHash">,
    private readonly payment: BaiRechargePayment,
  ) {}

  async execute(input: BaiCreateOrderInput) {
    // Keep the credit target stable even if an adapter mutates its input while awaiting I/O.
    const request = structuredClone(input);
    if (
      request.rechargeTarget &&
      (!request.rechargeTarget.input.identifier.trim() ||
        !request.rechargeTarget.confirmedTarget.targetId.trim())
    ) {
      throw new UsageError("invalid_value", "B.AI recharge requires a resolved recipient");
    }
    const order = await this.api.createOrder(structuredClone(request));
    let paid: Awaited<ReturnType<BaiRechargePayment["pay"]>>;
    try {
      paid = await this.payment.pay(order, structuredClone(request));
    } catch {
      throw new TransportError(
        "provider_error",
        "Recharge payment outcome is unknown; reconcile the transaction before paying again",
      );
    }
    if (!paid.txHash?.trim()) {
      throw new TransportError(
        "provider_error",
        "Recharge payment returned no transaction hash; reconcile before paying again",
      );
    }
    const reportInput = {
      chain: request.chain,
      txHash: paid.txHash,
      amount: request.amount,
      rechargeTarget: request.rechargeTarget,
    };
    if (paid.chain !== request.chain || paid.payer !== request.walletAddress) {
      return {
        ...reportInput,
        creditStatus: "unconfirmed" as const,
        retryPayment: false as const,
        warning: "Payment identity does not match the preorder; transaction was not reported",
      };
    }
    return this.report(reportInput);
  }

  /** Recovery entry point: only reports an existing hash; never creates an order or pays. */
  async report(input: BaiReportTransactionInput) {
    const request = structuredClone(input);
    const base = { ...request, retryPayment: false as const };
    try {
      const result = await this.api.reportTxHash(structuredClone(request));
      if (!result.success)
        return { ...base, creditStatus: "unconfirmed" as const, code: result.code };
      return { ...base, creditStatus: "credited" as const, order: result.order };
    } catch {
      return {
        ...base,
        creditStatus: "unconfirmed" as const,
        warning:
          "Recharge reporting failed; retain the transaction hash and reconcile before retrying reporting. Do not pay again",
      };
    }
  }
}
