import { describe, it, expect } from "vitest";
import {
  txBroadcastSpec,
  txBroadcastTronBinding,
  txSignSpec,
  txSignTronBinding,
} from "./tx.js";

const ctx = { activeAccount: "main" } as never;
const net = { family: "tron", id: "nile" } as never;

describe("tx sign spec", () => {
  it("does not broadcast and requires auth", () => {
    expect(txSignSpec.path).toEqual(["tx", "sign"]);
    expect(txSignSpec.broadcasts).toBeFalsy();
    expect(txSignSpec.auth).toBe("required");
  });

  it("accepts the retained JSON input and the new hex/file inputs", () => {
    expect(txSignSpec.baseFields.safeParse({ transaction: "{}" }).success).toBe(true);
    expect(txSignSpec.baseFields.safeParse({ hex: "abcd" }).success).toBe(true);
    expect(txSignSpec.baseFields.safeParse({ file: "tx.hex" }).success).toBe(true);
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
    await txSignTronBinding(svc as never, {} as never, {} as never)
      .run(ctx, net, { transaction: '{"txID":"abc"}' });
    expect(received).toEqual({ txID: "abc" });
  });

  it("rejects malformed JSON with invalid_value", async () => {
    const svc = { sign: async () => ({}) };
    await expect(txSignTronBinding(svc as never, {} as never, {} as never)
      .run(ctx, net, { transaction: "not json" }))
      .rejects.toMatchObject({ code: "invalid_value" });
  });

  it("routes hex co-signing through the multisig service and writes --out", async () => {
    const multisig = {
      sign: async () => ({ kind: "tx-sign", hex: "beef", signer: "T1", signerWeight: 1, transaction: {} }),
    };
    let written: unknown;
    const writer = { write: (path: string, hex: string) => { written = { path, hex }; } };
    const result = await txSignTronBinding({} as never, multisig as never, writer as never)
      .run(ctx, net, { hex: "abcd", out: "signed.hex" });
    expect(written).toEqual({ path: "signed.hex", hex: "beef" });
    expect(result).toMatchObject({ out: "signed.hex", hex: "beef" });
  });
});

describe("tx broadcast binding", () => {
  const broadcastContext = (stdin?: string, wait = false) => ({
    wait,
    secrets: {
      has: (kind: string) => kind === "tx" && stdin !== undefined,
      pick: (inline: string | undefined) => inline ?? stdin,
    },
  }) as never;

  it("retains JSON/stdin inputs and adds hex/file inputs", () => {
    expect(txBroadcastSpec.baseFields.safeParse({ transaction: "{}" }).success).toBe(true);
    expect(txBroadcastSpec.baseFields.safeParse({ hex: "abcd" }).success).toBe(true);
    expect(txBroadcastSpec.baseFields.safeParse({ file: "tx.hex" }).success).toBe(true);
  });

  it("routes protobuf hex without parsing it as JSON", async () => {
    const service = {
      broadcastHex: async (_ctx: unknown, _net: unknown, hex: string, dryRun: boolean) => ({
        hex,
        dryRun,
      }),
      broadcastJson: async () => {
        throw new Error("unexpected JSON route");
      },
    };
    await expect(txBroadcastTronBinding(service as never)
      .run(broadcastContext(), net, { hex: "aabb", dryRun: true }))
      .resolves.toEqual({ hex: "aabb", dryRun: true });
  });

  it("routes the retained --tx-stdin JSON source", async () => {
    let received: unknown;
    const service = {
      broadcastHex: async () => {
        throw new Error("unexpected hex route");
      },
      broadcastJson: async (_ctx: unknown, _net: unknown, transaction: unknown) => {
        received = transaction;
        return { txId: "abc" };
      },
    };
    await txBroadcastTronBinding(service as never)
      .run(broadcastContext('{"txID":"abc"}'), net, { dryRun: false });
    expect(received).toEqual({ txID: "abc" });
  });

  it("rejects ambiguous input and --wait with --dry-run", async () => {
    const service = { broadcastHex: async () => ({}), broadcastJson: async () => ({}) };
    await expect(txBroadcastTronBinding(service as never)
      .run(broadcastContext(), net, { transaction: "{}", hex: "aabb", dryRun: false }))
      .rejects.toMatchObject({ code: "invalid_option" });
    await expect(txBroadcastTronBinding(service as never)
      .run(broadcastContext(undefined, true), net, { hex: "aabb", dryRun: true }))
      .rejects.toMatchObject({ code: "invalid_option" });
  });
});
