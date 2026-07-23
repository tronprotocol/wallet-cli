import { describe, it, expect } from "vitest";
import { TxPipeline } from "./index.js";
import type { SignerResolver } from "../signer/index.js";
import type { Signer } from "../../../domain/types/index.js";

const TX = { txID: "abc", raw_data: {}, raw_data_hex: "0a02" };

function pipelineWith(signer: Partial<Signer>, assertCanSign = () => {}) {
  const resolver = { assertCanSign, resolve: () => signer as Signer } as unknown as SignerResolver;
  return new TxPipeline(resolver);
}

const scope = {
  timeoutMs: 100,
  wait: false,
  waitTimeoutMs: 0,
  activeAccount: "main",
  resolveAddress: () => "T1",
  emit: () => {},
  warn: () => {},
} as never;
const net = { family: "tron", id: "nile" } as never;

describe("TxPipeline.signOnly", () => {
  it("signs a caller-supplied transaction without building, estimating or broadcasting", async () => {
    const p = pipelineWith({
      kind: "software",
      address: "TSignerAddress",
      sign: async (tx) => ({ ...(tx as object), signature: ["deadbeef"] }),
    });
    const outcome = await p.signOnly({ ctx: scope, net, account: "main", tx: TX });
    expect(outcome).toMatchObject({
      stage: "signed",
      address: "TSignerAddress",
      txId: "abc",
      signed: { txID: "abc", signature: ["deadbeef"] },
    });
    // nothing was estimated, so no fee is invented
    expect((outcome as { fee?: unknown }).fee).toBeUndefined();
  });

  it("runs the device preliminaries for a Ledger signer", async () => {
    const events: unknown[] = [];
    const p = pipelineWith({
      kind: "device",
      address: "TLedger",
      precheck: async () => {},
      sign: async (tx) => ({ ...(tx as object), signature: ["beef"] }),
    });
    const ctx = { ...(scope as object), emit: (e: unknown) => events.push(e) } as never;
    await p.signOnly({ ctx, net, account: "main", tx: TX });
    expect(events).toEqual([{ type: "awaiting_device", reason: "sign" }]);
  });

  // A watch-only account must fail before any signing work, same as every write command.
  it("refuses an account that cannot sign", async () => {
    const p = pipelineWith({ kind: "software", address: "T1", sign: async () => ({}) }, () => {
      throw new Error("watch-only");
    });
    await expect(p.signOnly({ ctx: scope, net, account: "main", tx: TX })).rejects.toThrow(/watch-only/);
  });
});
