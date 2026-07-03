import { describe, it, expect, vi } from "vitest";
import { TxPipeline, type TxPipelineParams } from "./index.js";
import type { SignerResolver } from "../signer/index.js";
import type { Signer } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";

/** Minimal TransactionScope for pipeline tests. */
function scope(over: Partial<TransactionScope> = {}): TransactionScope {
  return {
    timeoutMs: 20,
    wait: false,
    waitTimeoutMs: 60_000,
    activeAccount: "acct" as never,
    resolveAddress: () => "TSender",
    emit: () => {},
    warn: () => {},
    ...over,
  } as TransactionScope;
}

function params(signer: Signer, over: Partial<TxPipelineParams> = {}): TxPipelineParams {
  return {
    ctx: scope(),
    net: { family: "tron" } as never,
    account: "acct" as never,
    broadcaster: { broadcast: async () => ({ txId: "tx" }) } as never,
    build: async () => ({}) as never,
    estimate: async () => ({}) as never,
    dryRun: false,
    broadcast: false,
    ...over,
  };
}

describe("TxPipeline device-sign timeout", () => {
  it("bounds a hung device signature by timeoutMs and aborts the signal", async () => {
    let captured: AbortSignal | undefined;
    const signer: Signer = {
      kind: "device",
      address: "TSender",
      precheck: vi.fn(async () => {}),
      // never resolves — models a device that is never tapped.
      sign: (_tx, opts) => {
        captured = opts.signal;
        return new Promise(() => {});
      },
      signMessage: async () => "",
    };
    const signers = { resolve: () => signer } as unknown as SignerResolver;

    await expect(new TxPipeline(signers).run(params(signer))).rejects.toMatchObject({ code: "timeout" });
    expect(captured?.aborted).toBe(true); // the abort is wired so the device prompt is cancelled
  });
});
