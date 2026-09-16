import { expect, it } from "vitest";
import { sdkPaymentError, providerPaymentError } from "./payment-error.js";
import { UsageError } from "../../../domain/errors/index.js";
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
