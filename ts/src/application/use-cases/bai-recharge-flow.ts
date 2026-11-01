import {
  assertSubmitAdmitted,
  endedByDeadline,
  submitDispatchCheck,
} from "../services/command-deadline.js";
import { DeadlineExpiredError, type ExecutionDeadline } from "../contracts/deadline.js";
import type {
  BaiCreateOrderInput,
  BaiReportDelay,
  BaiRechargeApi,
  BaiRechargePayment,
  BaiReportTransactionInput,
} from "../ports/bai-recharge.js";
import {
  CliError,
  errorMessage,
  followUp,
  UsageError,
  TransportError,
} from "../../domain/errors/index.js";

// No payment retries; retain the paid hash for report-only recovery.
export class BaiRechargeFlow {
  constructor(
    private readonly api: Pick<BaiRechargeApi, "createOrder" | "reportTxHash">,
    private readonly payment: BaiRechargePayment,
    private readonly delay?: BaiReportDelay,
    private readonly progress: (message: string) => void = () => {},
  ) {}

  async execute(deadline: ExecutionDeadline, input: BaiCreateOrderInput) {
    // Keep the credit target stable even if an adapter mutates its input while awaiting I/O.
    const request = structuredClone(input);
    if (
      request.rechargeTarget &&
      (!request.rechargeTarget.input.identifier.trim() ||
        !request.rechargeTarget.confirmedTarget.targetId.trim())
    ) {
      throw new UsageError("invalid_value", "B.AI recharge requires a resolved recipient");
    }
    this.progress("Creating the B.AI recharge preorder…");
    assertSubmitAdmitted(deadline);
    const order = await this.api.createOrder(
      structuredClone(request),
      submitDispatchCheck(deadline),
    );
    // The preorder exists from here on; a failed payment still reports it.
    const created = order.orderId === undefined ? {} : { orderId: order.orderId };
    let paid: Awaited<ReturnType<BaiRechargePayment["pay"]>>;
    try {
      paid = await this.payment.pay(order, structuredClone(request));
    } catch (error) {
      // Preserve classified payment failures and any settlement evidence.
      if (error instanceof CliError) {
        const ErrorType = error.kind === "usage" ? UsageError : TransportError;
        throw new ErrorType(error.code, error, {
          paymentStatus: "unknown",
          ...error.details,
          retryPayment: false,
          chain: request.chain,
          amount: request.amount,
          ...(request.rechargeTarget ? { rechargeTarget: request.rechargeTarget } : {}),
          ...created,
        });
      }
      throw new TransportError(
        "provider_error",
        "Recharge payment outcome is unknown; reconcile the transaction before paying again",
        { paymentStatus: "unknown", retryPayment: false, ...created },
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
    if (this.delay?.initialDelayMs) {
      this.progress("Waiting for the transaction to be indexed before reporting it to B.AI…");
      await this.delay.wait(this.delay.initialDelayMs, deadline.signal).catch((error: unknown) => {
        if (!endedByDeadline(error, deadline)) throw error;
      });
    }
    // The payment stands; only the report is skipped once the time limit has ended.
    if (deadline.expired()) {
      return {
        ...reportInput,
        creditStatus: "unconfirmed" as const,
        retryPayment: false as const,
        code: "timeout",
        warning: reportLaterWarning(),
      };
    }
    this.progress("Submitting the transaction hash to B.AI and checking credit confirmation…");
    const reported = await this.report(deadline, reportInput);
    // Treat a just-paid hash reported as missing as a possible indexing delay.
    return "code" in reported && reported.code === "TX_NOT_FOUND_OR_INVALID"
      ? {
          ...reported,
          warning: errorMessage`B.AI has not indexed the transaction yet; report it again in a minute with \`${followUp("bai-report-recharge")}\``,
        }
      : reported;
  }

  // Reports an existing hash without creating an order or paying.
  async report(deadline: ExecutionDeadline, input: BaiReportTransactionInput) {
    return reportBaiTransaction(deadline, this.api, input);
  }
}

// One report attempt; never invokes payment.
export async function reportBaiTransaction(
  deadline: ExecutionDeadline,
  api: Pick<BaiRechargeApi, "reportTxHash">,
  input: BaiReportTransactionInput,
) {
  const request = structuredClone(input);
  const base = { ...request, retryPayment: false as const };
  try {
    assertSubmitAdmitted(deadline);
    const result = await api.reportTxHash(structuredClone(request), submitDispatchCheck(deadline));
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
    // Refused before dispatch: B.AI never saw the report.
    if (error instanceof DeadlineExpiredError) {
      return {
        ...base,
        creditStatus: "unconfirmed" as const,
        code: "timeout",
        warning: reportLaterWarning(),
      };
    }
    return {
      ...base,
      creditStatus: "unconfirmed" as const,
      ...(error instanceof CliError
        ? {
            code: error.code,
            error: {
              code: error.code,
              message: error.message,
              ...(error.details === undefined ? {} : { details: error.details }),
            },
          }
        : {}),
      warning:
        "Recharge reporting failed; retain the transaction hash and reconcile before retrying reporting. Do not pay again",
    };
  }
}

function reportLaterWarning() {
  return errorMessage`The command's time limit ended before the payment was reported to B.AI; report it with \`${followUp("bai-report-recharge")}\`. Do not pay again`;
}
