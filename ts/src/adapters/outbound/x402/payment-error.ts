import { CliError, TransportError, UsageError } from "../../../domain/errors/index.js";

// Only emit our own messages. SDK/provider messages can contain credentials and URLs.
const transportCodes = ["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"] as const;

const reasons: Record<string, () => TransportError> = {
  timeout: () =>
    new TransportError("timeout", "x402 upstream request timed out; reconcile before paying again"),
  gasfree_insufficient_balance: () =>
    new TransportError(
      "gasfree_insufficient_balance",
      "GasFree wallet balance cannot cover the payment and maximum fee",
    ),
  gasfree_not_activated: () =>
    new TransportError("gasfree_not_activated", "GasFree account is not activated"),
  permit2_allowance_required: () =>
    new TransportError(
      "permit2_allowance_required",
      "Token allowance for Permit2 is insufficient; review the allowance before approving or retrying payment",
    ),
  approval_reset_required: () =>
    new TransportError(
      "approval_reset_required",
      "This token requires its existing allowance to be reset to zero before approval",
    ),
  insufficient_funds: () =>
    new TransportError("insufficient_balance", "The payment account has insufficient funds"),
};

export function providerPaymentError(
  reason: unknown,
  phase: "verify" | "settle",
  evidence?: Record<string, unknown>,
) {
  const key = reason === "insufficient_balance" ? "insufficient_funds" : reason;
  const known =
    typeof key === "string" && Object.hasOwn(reasons, key) ? reasons[key]!() : undefined;
  return new TransportError(
    known?.code ?? "provider_error",
    known?.message ?? `x402 payment ${phase === "verify" ? "verification" : "settlement"} failed`,
    {
      phase,
      paymentStatus: "unknown",
      retryPayment: false,
      ...(typeof key === "string" &&
      (Object.hasOwn(reasons, key) ||
        [
          "invalid_transaction_state",
          "OUT_OF_ENERGY",
          "transaction_reverted",
          "connection_failed",
          "http_error",
        ].includes(key))
        ? { reason: key }
        : {}),
      ...candidateEvidence(evidence),
    },
  );
}

export type PaymentPhase =
  "request" | "challenge" | "create_payment" | "sign" | "payment_request" | "verify" | "settle";
export function sdkPaymentError(error: unknown, phase?: PaymentPhase): CliError {
  if (error instanceof CliError) {
    if (!phase || (error.details as Record<string, unknown> | undefined)?.phase) return error;
    const ErrorType = error.kind === "usage" ? UsageError : TransportError;
    return new ErrorType(error.code, error.message, {
      ...error.details,
      phase,
      retryPayment: false,
    });
  }
  const message = error instanceof Error ? error.message : "";
  // x402-fetch wraps errors while retaining the SDK message.
  const cause = message.replace(/^Failed to create payment payload: /, "");
  const record =
    error && typeof error === "object"
      ? (error as {
          response?: { status?: unknown };
          status?: unknown;
          cause?: { code?: unknown };
          code?: unknown;
        })
      : undefined;
  const status =
    record?.response?.status ??
    record?.status ??
    /^Request failed with status code ([45]\d{2})$/.exec(cause)?.[1];
  const httpStatus =
    typeof status === "number" || typeof status === "string" ? Number(status) : undefined;
  if (
    httpStatus !== undefined &&
    Number.isInteger(httpStatus) &&
    httpStatus >= 400 &&
    httpStatus <= 599
  )
    return new TransportError(
      "provider_error",
      `x402 upstream request returned HTTP ${httpStatus}; reconcile before paying again`,
      {
        ...(phase ? { phase } : {}),
        httpStatus,
        reason: "http_error",
        paymentStatus: "unknown",
        retryPayment: false,
      },
    );
  const transportCode = record?.code ?? record?.cause?.code;
  if (
    typeof transportCode === "string" &&
    (transportCodes as readonly string[]).includes(transportCode)
  )
    return new TransportError(
      "provider_error",
      "x402 upstream connection failed; reconcile before paying again",
      {
        ...(phase ? { phase } : {}),
        reason: "connection_failed",
        transportCode,
        paymentStatus: "unknown",
        retryPayment: false,
      },
    );
  let reason: string | undefined;
  if (/^Insufficient balance in GasFree wallet /.test(cause)) {
    reason = "gasfree_insufficient_balance";
  } else if (/^GasFree account for .* is not activated\.$/.test(cause)) {
    reason = "gasfree_not_activated";
  } else {
    reason = Object.keys(reasons).find((key) => cause === key || cause.startsWith(`${key}:`));
  }
  if (reason) {
    const known = reasons[reason]!();
    return new TransportError(known.code, known.message, {
      ...(phase ? { phase } : {}),
      reason,
      paymentStatus: reason.startsWith("gasfree_") ? "not_sent" : "unknown",
      retryPayment: false,
    });
  }
  if (error instanceof Error && /timeout|aborted/i.test(`${error.name} ${message}`)) {
    return new TransportError("timeout", "x402 request timed out; reconcile before paying again", {
      ...(phase ? { phase } : {}),
      paymentStatus: "unknown",
      retryPayment: false,
    });
  }
  return new TransportError(
    "provider_error",
    "x402 request or payment failed; reconcile before paying again",
    {
      ...(phase ? { phase } : {}),
      paymentStatus: "unknown",
      retryPayment: false,
    },
  );
}

function candidateEvidence(value?: Record<string, unknown>) {
  const hash = value?.transaction ?? value?.candidateTxHash;
  const network = value?.network ?? value?.candidateNetwork;
  const status = value?.httpStatus;
  const transportCode = value?.transportCode;
  return {
    ...(typeof transportCode === "string" &&
    (transportCodes as readonly string[]).includes(transportCode)
      ? { transportCode }
      : {}),
    ...(typeof hash === "string" && /^(?:0x)?[0-9a-fA-F]{64}$/.test(hash)
      ? { candidateTxHash: hash }
      : {}),
    ...(typeof network === "string" &&
    /^(?:eip155:\d{1,20}|tron:(?:0x[0-9a-fA-F]{1,16}|\d{1,20}))$/.test(network)
      ? { candidateNetwork: network }
      : {}),
    ...(typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599
      ? { httpStatus: status }
      : {}),
  };
}
