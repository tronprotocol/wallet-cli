import { describe, expect, it, vi } from "vitest";
import { authoritativeTxId, submitWithTxId } from "./broadcast-identity.js";
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

describe("authoritativeTxId", () => {
  const LOCAL = "ab".repeat(32);

  it.each([
    ["tron", LOCAL, `0x${LOCAL.toUpperCase()}`],
    ["evm", `0x${LOCAL}`, `0x${LOCAL.toUpperCase()}`],
  ] as const)(
    "accepts another spelling of the same %s id without a warning",
    (family, local, reported) => {
      const warn = vi.fn();
      expect(authoritativeTxId(family, local, reported, warn)).toBe(local);
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it.each(["cd".repeat(32), "not-a-hash"])("keeps the local id and warns on %s", (reported) => {
    const warn = vi.fn();
    expect(authoritativeTxId("tron", LOCAL, reported, warn)).toBe(LOCAL);
    expect(warn).toHaveBeenCalledOnce();
  });
});
