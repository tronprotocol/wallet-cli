import { describe, expect, it } from "vitest";
import { submitWithTxId } from "./broadcast-identity.js";
import { DeadlineExpiredError } from "../contracts/deadline.js";
import { TransportError } from "../../domain/errors/index.js";

describe("submitWithTxId", () => {
  it("attaches the txId to a submit whose reply was lost", async () => {
    await expect(
      submitWithTxId("tx-1", () => Promise.reject(new TransportError("timeout", "lost"))),
    ).rejects.toMatchObject({ code: "timeout", details: { txId: "tx-1" } });
  });

  it("leaves a refusal before dispatch without a txId", async () => {
    const refusal = new DeadlineExpiredError();
    await expect(submitWithTxId("tx-1", () => Promise.reject(refusal))).rejects.toBe(refusal);
  });
});
