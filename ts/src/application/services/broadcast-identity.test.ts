import { describe, expect, it } from "vitest";
import { submitWithTxId } from "./broadcast-identity.js";
import { DeadlineExpiredError } from "../contracts/deadline.js";
import { ChainError, TransportError } from "../../domain/errors/index.js";

describe("submitWithTxId", () => {
  it("attaches the txId and the unknown outcome to a submit whose reply was lost", async () => {
    await expect(
      submitWithTxId("tx-1", () => Promise.reject(new TransportError("timeout", "lost"))),
    ).rejects.toMatchObject({ code: "timeout", details: { txId: "tx-1", outcome: "unknown" } });
  });

  it("marks the outcome unknown without inventing a txId", async () => {
    const error = (await submitWithTxId(undefined, () =>
      Promise.reject(new ChainError("rpc_error", "lost")),
    ).catch((e: unknown) => e)) as ChainError;
    expect(error.details).toEqual({ outcome: "unknown" });
  });

  it("leaves a refusal before dispatch without a txId or outcome", async () => {
    const refusal = new DeadlineExpiredError();
    await expect(submitWithTxId("tx-1", () => Promise.reject(refusal))).rejects.toBe(refusal);
    expect(refusal.details).toBeUndefined();
  });

  it("leaves a definite rejection without an outcome", async () => {
    const rejection = new ChainError("transaction_rejected", "refused");
    await expect(submitWithTxId("tx-1", () => Promise.reject(rejection))).rejects.toBe(rejection);
    expect(rejection.details).toBeUndefined();
  });
});
