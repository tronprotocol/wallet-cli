import { describe, expect, it, vi } from "vitest";
import { ChainError, ExecutionError } from "../../domain/errors/index.js";
import { DeadlineExpiredError } from "../contracts/deadline.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import { CommandDeadline } from "./command-deadline.js";
import { submitAndStage } from "./submit-and-stage.js";
import { broadcastResult } from "../../adapters/outbound/chain/tron/chain-response.js";

function scope(wait: boolean | undefined) {
  const warn = vi.fn();
  const s: Pick<TransactionScope, "deadline" | "wait" | "warn"> = {
    deadline: new CommandDeadline(0),
    wait,
    warn,
  };
  return { s, warn };
}

const TX1 = "11".repeat(32);
const confirmed = { confirmed: true as const, failed: false, blockNumber: 3 };

describe("submitAndStage", () => {
  it("takes the node's hash when the signed transaction carries no id", async () => {
    const { s, warn } = scope(true);
    const confirm = vi.fn(async () => confirmed);
    const out = await submitAndStage("evm", s, undefined, async () => ({ hash: "0xab" }), confirm);

    expect(confirm).toHaveBeenCalledWith("0xab");
    expect(out).toMatchObject({ stage: "confirmed", txId: "0xab", hash: "0xab" });
    expect(warn).not.toHaveBeenCalled();
  });

  it("passes the submit dispatch check to the submit", async () => {
    const { s } = scope(false);
    const submit = vi.fn(async () => ({ txId: "a" }));
    await submitAndStage("tron", s, "a", submit, async () => confirmed);

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: s.deadline.signal,
        assertDispatchable: expect.any(Function),
      }),
    );
  });

  it("reports the txId in details when the node message naming it is redacted", async () => {
    const { s } = scope(false);
    const error = await submitAndStage(
      "tron",
      s,
      TX1,
      async () => broadcastResult({ code: "OTHER_ERROR", message: `cannot process ${TX1}` }, TX1),
      async () => confirmed,
    ).catch((e: unknown) => e);

    expect(error).toMatchObject({
      code: "rpc_error",
      details: { txId: TX1, outcome: "unknown" },
    });
    expect((error as Error).message).not.toContain(TX1);
  });

  it("does not wait without an id and says so", async () => {
    const { s, warn } = scope(undefined);
    const confirm = vi.fn(async () => confirmed);
    const out = await submitAndStage(
      "evm",
      s,
      undefined,
      async () => ({ alreadyKnown: true }),
      confirm,
    );

    expect(out).toEqual({ stage: "submitted", alreadyKnown: true });
    expect(confirm).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "the broadcast returned no txid; returning submitted (unconfirmed)",
    );
  });
});

describe("submitAndStage with a required confirmation", () => {
  it("throws the error that stopped the wait, as an outcome-unknown submit error", async () => {
    const { s, warn } = scope(true);
    const stop = new ChainError("not_found", "no receipts here", { nodeCode: "x" });
    const error = await submitAndStage(
      "tron",
      s,
      TX1,
      async () => ({ txId: TX1 }),
      async () => {
        throw stop;
      },
      { confirmationRequired: true },
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExecutionError);
    expect(error).toMatchObject({
      code: "not_found",
      message: "no receipts here",
      details: { nodeCode: "x", txId: TX1, outcome: "unknown" },
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("still returns submitted when the deadline ends the wait", async () => {
    const clock = { now: () => 0 };
    const deadline = new CommandDeadline(10_000, 0, clock);
    deadline.dispose();
    const warn = vi.fn();
    const out = await submitAndStage(
      "tron",
      { deadline, wait: true, warn },
      TX1,
      async () => {
        clock.now = () => 10_000;
        return { txId: TX1 };
      },
      async () => {
        throw new DeadlineExpiredError();
      },
      { confirmationRequired: true },
    );

    expect(out).toMatchObject({ stage: "submitted", txId: TX1 });
    expect(warn).toHaveBeenCalledOnce();
  });
});
