import { CliError, TransportError } from "../../../domain/errors/index.js";

// Only emit our own messages. SDK/provider messages can contain credentials and URLs.
const reasons: Record<string, () => TransportError> = {
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

export function providerPaymentError(reason: unknown, phase: "verify" | "settle") {
  const key = reason === "insufficient_balance" ? "insufficient_funds" : reason;
  const known =
    typeof key === "string" && Object.hasOwn(reasons, key) ? reasons[key]!() : undefined;
  return new TransportError(
    known?.code ?? "provider_error",
    known?.message ?? `x402 payment ${phase === "verify" ? "verification" : "settlement"} failed`,
    { phase, paymentStatus: "unknown", retryPayment: false },
  );
}

export function sdkPaymentError(error: unknown): CliError {
  if (error instanceof CliError) return error;
  const message = error instanceof Error ? error.message : "";
  // x402-fetch wraps errors while retaining the SDK message.
  const cause = message.replace(/^Failed to create payment payload: /, "");
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
      paymentStatus: reason.startsWith("gasfree_") ? "not_sent" : "unknown",
      retryPayment: false,
    });
  }
  if (error instanceof Error && /timeout|aborted/i.test(`${error.name} ${message}`)) {
    return new TransportError("timeout", "x402 request timed out; reconcile before paying again", {
      paymentStatus: "unknown",
      retryPayment: false,
    });
  }
  return new TransportError(
    "provider_error",
    "x402 request or payment failed; reconcile before paying again",
    {
      paymentStatus: "unknown",
      retryPayment: false,
    },
  );
}
