import type {
  BaiCreateOrderInput,
  BaiReportRetry,
  BaiRechargeApi,
  BaiRechargePayment,
  BaiReportTransactionInput,
} from "../ports/bai-recharge.js";
import { CliError, UsageError, TransportError } from "../../domain/errors/index.js";

/** Internal orchestration after target resolution and wallet binding. No implicit payment retries. */
export class BaiRechargeFlow {
  constructor(
    private readonly api: Pick<BaiRechargeApi, "createOrder" | "reportTxHash">,
    private readonly payment: BaiRechargePayment,
    private readonly retry?: BaiReportRetry,
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
    } catch (error) {
      // Preserve classified payment failures and any settlement evidence.
      if (error instanceof CliError) {
        const ErrorType = error.kind === "usage" ? UsageError : TransportError;
        throw new ErrorType(error.code, error.message, {
          paymentStatus: "unknown",
          ...error.details,
          retryPayment: false,
          chain: request.chain,
          amount: request.amount,
          ...(request.rechargeTarget ? { rechargeTarget: request.rechargeTarget } : {}),
        });
      }
      throw new TransportError(
        "provider_error",
        "Recharge payment outcome is unknown; reconcile the transaction before paying again",
        { paymentStatus: "unknown", retryPayment: false },
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
    return reportBaiTransaction(this.api, input, this.retry);
  }
}

/** Report-only recovery shared by the recharge flow and CLI. Never invokes payment. */
export async function reportBaiTransaction(
  api: Pick<BaiRechargeApi, "reportTxHash">,
  input: BaiReportTransactionInput,
  retry?: BaiReportRetry,
) {
  const request = structuredClone(input);
  if (!retry) return reportOnce(api, request);
  const deadline = retry.now() + retry.timeoutMs;
  let result = await reportOnce(api, request, retry.timeoutMs);
  for (const delay of retry.delaysMs) {
    if (
      result.creditStatus === "credited" ||
      !["TX_NOT_FOUND_OR_INVALID", "TX_TIMESTAMP_UNAVAILABLE"].includes(result.code ?? "")
    )
      break;
    if (retry.now() + delay >= deadline) break;
    await retry.wait(delay);
    const remaining = deadline - retry.now();
    if (remaining <= 0) break;
    result = await reportOnce(api, request, remaining);
  }
  return result;
}

async function reportOnce(
  api: Pick<BaiRechargeApi, "reportTxHash">,
  input: BaiReportTransactionInput,
  timeoutMs?: number,
) {
  const request = structuredClone(input);
  const base = { ...request, retryPayment: false as const };
  try {
    const result = await (timeoutMs === undefined
      ? api.reportTxHash(structuredClone(request))
      : api.reportTxHash(structuredClone(request), {
          signal: AbortSignal.timeout(Math.ceil(timeoutMs)),
        }));
    if (!result.success)
      return {
        ...base,
        creditStatus: "unconfirmed" as const,
        code: result.code,
        ...(result.message ? { warning: result.message } : {}),
      };
    return { ...base, creditStatus: "credited" as const, order: result.order };
  } catch (error) {
    if (error instanceof UsageError) throw error;
    return {
      ...base,
      creditStatus: "unconfirmed" as const,
      ...(error instanceof CliError ? { code: error.code, error: error.toEnvelope() } : {}),
      warning:
        "Recharge reporting failed; retain the transaction hash and reconcile before retrying reporting. Do not pay again",
    };
  }
}
