import type {
  BaiCreateOrderInput,
  BaiReportDelay,
  BaiRechargeApi,
  BaiRechargePayment,
  BaiReportTransactionInput,
} from "../ports/bai-recharge.js";
import { CliError, UsageError, TransportError } from "../../domain/errors/index.js";

/** Internal orchestration after target resolution and wallet binding. No implicit retries: the
 * transaction is reported once; an unconfirmed result carries the hash for `report-recharge`. */
export class BaiRechargeFlow {
  constructor(
    private readonly api: Pick<BaiRechargeApi, "createOrder" | "reportTxHash">,
    private readonly payment: BaiRechargePayment,
    private readonly delay?: BaiReportDelay,
    private readonly progress: (message: string) => void = () => {},
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
    this.progress("Creating the B.AI recharge preorder…");
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
    if (this.delay?.initialDelayMs) {
      this.progress("Waiting for the transaction to be indexed before reporting it to B.AI…");
      await this.delay.wait(this.delay.initialDelayMs);
    }
    this.progress("Submitting the transaction hash to B.AI and checking credit confirmation…");
    const reported = await this.report(reportInput);
    // The hash was just paid, so "not found" means B.AI has not indexed it yet, not a bad hash.
    return "code" in reported && reported.code === "TX_NOT_FOUND_OR_INVALID"
      ? {
          ...reported,
          warning:
            "B.AI has not indexed the transaction yet; report it again in a minute with `bai report-recharge`",
        }
      : reported;
  }

  /** Recovery entry point: only reports an existing hash; never creates an order or pays. */
  async report(input: BaiReportTransactionInput) {
    return reportBaiTransaction(this.api, input);
  }
}

/** Single report shared by the recharge flow and CLI. Never invokes payment, never retries. */
export async function reportBaiTransaction(
  api: Pick<BaiRechargeApi, "reportTxHash">,
  input: BaiReportTransactionInput,
) {
  const request = structuredClone(input);
  const base = { ...request, retryPayment: false as const };
  try {
    const result = await api.reportTxHash(structuredClone(request));
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
