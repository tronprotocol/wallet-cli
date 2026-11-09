import { expect, it } from "vitest";
import { TransportError, UsageError } from "../../domain/errors/index.js";
import { DeadlineExpiredError, withErrorDetails } from "./deadline.js";

it("keeps a deadline refusal a DeadlineExpiredError when its details change", () => {
  const error = withErrorDetails(new DeadlineExpiredError("late"), { paymentStatus: "not_sent" });
  expect(error).toBeInstanceOf(DeadlineExpiredError);
  expect(error).toMatchObject({
    code: "timeout",
    message: "late",
    details: { paymentStatus: "not_sent" },
  });
});

it.each([
  [new UsageError("invalid_option", "bad"), UsageError],
  [new TransportError("provider_error", "down"), TransportError],
])("copies %s with its kind and new details", (original, ErrorType) => {
  const error = withErrorDetails(original, { phase: "sign" }, "replaced");
  expect(error).toBeInstanceOf(ErrorType);
  expect(error).not.toBeInstanceOf(DeadlineExpiredError);
  expect(error).toMatchObject({
    code: original.code,
    message: "replaced",
    details: { phase: "sign" },
  });
});
