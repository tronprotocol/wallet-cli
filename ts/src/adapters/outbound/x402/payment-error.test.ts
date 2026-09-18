import { expect, it } from "vitest";
import { sdkPaymentError, providerPaymentError } from "./payment-error.js";
import { UsageError, TransportError } from "../../../domain/errors/index.js";
it.each([403, 429, 502])(
  "reports HTTP %s and stage without leaking SDK request contents",
  (status) => {
    const error = Object.assign(new Error("SECRET"), {
      response: { status, data: "SECRET" },
      config: { headers: { Authorization: "SECRET" } },
    });
    const result = sdkPaymentError(error, "create_payment");
    expect(result).toMatchObject({
      code: status === 429 ? "provider_rate_limited" : "provider_error",
      details: {
        phase: "create_payment",
        reason: "http_error",
        httpStatus: status,
        retryPayment: false,
      },
    });
    expect(JSON.stringify(result.toEnvelope())).not.toContain("SECRET");
  },
);
it("classifies the SDK HTTP wrapper without disclosing arbitrary text", () => {
  expect(
    sdkPaymentError(
      new Error("Failed to create payment payload: Request failed with status code 403"),
      "create_payment",
    ),
  ).toMatchObject({ details: { httpStatus: 403 } });
  expect(sdkPaymentError(new Error("SECRET"), "request").message).not.toContain("SECRET");
});
it("keeps the signing stage through the SDK wrapper", () => {
  const signed = sdkPaymentError(new UsageError("invalid_value", "rejected"), "sign");
  expect(sdkPaymentError(signed, "create_payment")).toMatchObject({
    kind: "usage",
    details: { phase: "sign" },
  });
});
it("retains failed settlement hash and safe reason without calling it successful", () => {
  const error = providerPaymentError("invalid_transaction_state", "settle", {
    transaction: "a".repeat(64),
    network: "tron:0x2b6653dc",
    secret: "SECRET",
  });
  expect(error).toMatchObject({
    details: {
      candidateTxHash: "a".repeat(64),
      reason: "invalid_transaction_state",
      paymentStatus: "unknown",
      retryPayment: false,
    },
  });
  expect(JSON.stringify(error.toEnvelope())).not.toContain("SECRET");
  expect(
    providerPaymentError("SECRET", "settle", {
      transaction: "SECRET",
      network: "SECRET",
    }).toEnvelope(),
  ).not.toHaveProperty("details.candidateTxHash");
});

it.each([
  Object.assign(new Error("redacted"), { code: "DEADLINE_OR_CLOCK_SKEW" }),
  new Error("Failed to create payment payload: DEADLINE_OR_CLOCK_SKEW"),
  new Error("redacted", { cause: new Error("DEADLINE_OR_CLOCK_SKEW") }),
])("classifies expired authorization without making it retryable", (error) => {
  expect(sdkPaymentError(error, "sign")).toMatchObject({
    code: "tx_expired",
    details: { phase: "sign", retryPayment: false },
  });
});

it.each(["challenge", "create_payment", "payment_request", "verify", "settle"] as const)(
  "maps %s rate limits without authorizing repayment",
  (phase) => {
    expect(sdkPaymentError({ response: { status: 429 } }, phase)).toMatchObject({
      code: "provider_rate_limited",
      details: { phase, retryPayment: false, httpStatus: 429 },
    });
  },
);

it("retains only numeric Retry-After hints", () => {
  const result = sdkPaymentError(
    { response: { status: 429, headers: { "retry-after": "30" } } },
    "settle",
  );
  expect(result.details).toMatchObject({ retryAfterSeconds: 30, retryPayment: false });
  const unsafe = sdkPaymentError(
    { response: { status: 429, headers: { "retry-after": "https://secret.example/token" } } },
    "settle",
  );
  expect(JSON.stringify(unsafe.toEnvelope())).not.toContain("secret");
});

it("classifies a missing GasFree asset before payment creation without exposing SDK text", () => {
  const error = sdkPaymentError(
    new Error(
      "Asset TGjgvdTWWrybVLaVeFqSyVqJQWjxqRYbaK not found in GasFree account TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ.",
    ),
    "create_payment",
  );
  expect(error).toMatchObject({
    code: "gasfree_asset_unsupported",
    details: { paymentStatus: "not_sent", retryPayment: false },
  });
  expect(error.message).not.toContain("TGjgvd");
});

it("uses not_sent only when the caller has no authorization or transaction evidence", async () => {
  const { unsentPaymentError } = await import("./payment-error.js");
  expect(unsentPaymentError(new Error("insufficient_funds"), "create_payment")).toMatchObject({
    code: "insufficient_balance",
    details: { paymentStatus: "not_sent" },
  });
  const failure = new TransportError("provider_error", "settlement uncertain", {
    candidateTxHash: "a".repeat(64),
    paymentStatus: "unknown",
  });
  expect(unsentPaymentError(failure, "payment_request")).toMatchObject({
    details: { paymentStatus: "unknown" },
  });
});

/**
 * Without an explicit --max-amount the SDK's own $1-per-payment spend control stays on, and it
 * rejects inside `selectPaymentRequirements` — before any payment is created — with a plain
 * Error. That is a deterministic policy refusal the caller can act on, not an upstream failure.
 */
it.each([
  [
    "All payment requirements were rejected by spendControls.maxAmountPerPayment ($1, including USDT). Raise maxAmountPerPayment, set it to false to disable, set allowedAssets[].maxAmountPerPayment for a per-asset atomic cap, or set spendControls: false to disable all spend controls.",
    "amount_exceeds_limit",
  ],
  [
    "All payment requirements were rejected by spendControls: only default assets or entries in spendControls.allowedAssets are allowed. Add an allowedAssets entry for non-default tokens, set allowedAssets: true, or set spendControls: false.",
    "no_matching_requirement",
  ],
])("classifies the SDK's spend-control refusal as a typed, not-sent error", (message, code) => {
  const error = sdkPaymentError(
    new Error(`Failed to create payment payload: ${message}`),
    "payment_request",
  );
  expect(error).toMatchObject({
    code,
    details: { phase: "payment_request", paymentStatus: "not_sent", retryPayment: false },
  });
  expect(error.message).toContain("--max-amount");
});
