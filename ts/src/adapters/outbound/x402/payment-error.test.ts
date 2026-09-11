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
      code: "provider_error",
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
