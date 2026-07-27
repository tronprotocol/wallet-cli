import { describe, it, expect } from "vitest";
import { txSignSpec, txSignTronBinding } from "./tx.js";

const ctx = { activeAccount: "main" } as never;
const net = { family: "tron", id: "nile" } as never;

describe("tx sign spec", () => {
  it("does not broadcast and requires auth", () => {
    expect(txSignSpec.path).toEqual(["tx", "sign"]);
    expect(txSignSpec.broadcasts).toBeFalsy();
    expect(txSignSpec.auth).toBe("required");
  });

  it("requires a --transaction payload", () => {
    expect(txSignSpec.baseFields.safeParse({}).success).toBe(false);
    expect(txSignSpec.baseFields.safeParse({ transaction: "{}" }).success).toBe(true);
  });

  // the payload is not a secret, so argv is the only channel — no --tx-stdin on this command.
  it("declares no stdin channel", () => {
    expect(txSignSpec.stdin).toBeUndefined();
  });
});

describe("tx sign binding", () => {
  it("parses the JSON payload and hands it to the service", async () => {
    let received: unknown;
    const svc = {
      sign: async (_c: unknown, _n: unknown, tx: unknown) => {
        received = tx;
        return { kind: "sign" };
      },
    };
    await txSignTronBinding(svc as never).run(ctx, net, { transaction: '{"txID":"abc"}' });
    expect(received).toEqual({ txID: "abc" });
  });

  it("rejects malformed JSON with invalid_value", async () => {
    const svc = { sign: async () => ({}) };
    await expect(txSignTronBinding(svc as never).run(ctx, net, { transaction: "not json" }))
      .rejects.toMatchObject({ code: "invalid_value" });
  });
});
