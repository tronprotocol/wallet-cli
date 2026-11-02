import { describe, expect, it, vi } from "vitest";
import type { TransactionScope } from "../contracts/execution-scope.js";
import { CommandDeadline } from "./command-deadline.js";
import { submitAndStage } from "./submit-and-stage.js";

function scope(wait: boolean | undefined) {
  const warn = vi.fn();
  const s: Pick<TransactionScope, "deadline" | "wait" | "warn"> = {
    deadline: new CommandDeadline(0),
    wait,
    warn,
  };
  return { s, warn };
}

const confirmed = { confirmed: true as const, failed: false, blockNumber: 3 };

describe("submitAndStage", () => {
  it("takes the node's hash when the signed transaction carries no id", async () => {
    const { s, warn } = scope(true);
    const confirm = vi.fn(async () => confirmed);
    const out = await submitAndStage(s, undefined, async () => ({ hash: "0xab" }), confirm);

    expect(confirm).toHaveBeenCalledWith("0xab");
    expect(out).toMatchObject({ stage: "confirmed", txId: "0xab", hash: "0xab" });
    expect(warn).not.toHaveBeenCalled();
  });

  it("passes the submit dispatch check to the submit", async () => {
    const { s } = scope(false);
    const submit = vi.fn(async () => ({ txId: "a" }));
    await submitAndStage(s, "a", submit, async () => confirmed);

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: s.deadline.signal,
        assertDispatchable: expect.any(Function),
      }),
    );
  });

  it("does not wait without an id and says so", async () => {
    const { s, warn } = scope(undefined);
    const confirm = vi.fn(async () => confirmed);
    const out = await submitAndStage(s, undefined, async () => ({ alreadyKnown: true }), confirm);

    expect(out).toEqual({ stage: "submitted", alreadyKnown: true });
    expect(confirm).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "the broadcast returned no txid; returning submitted (unconfirmed)",
    );
  });
});
