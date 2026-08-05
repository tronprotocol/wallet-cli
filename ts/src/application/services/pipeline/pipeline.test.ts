import { describe, it, expect, vi } from "vitest";
import { TxPipeline, type TxPipelineParams } from "./index.js";
import type { SignerResolver } from "../signer/index.js";
import type { Signer } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import { ChainError } from "../../../domain/errors/index.js";

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
      signTypedData: async () => ({ signature: "", digest: "", primaryType: "" }),
    };
    const signers = { assertCanSign: () => {}, resolve: () => signer } as unknown as SignerResolver;

    await expect(new TxPipeline(signers).run(params(signer))).rejects.toMatchObject({ code: "timeout" });
    expect(captured?.aborted).toBe(true); // the abort is wired so the device prompt is cancelled
  });

  it("build-only uses the public address and never resolves or unlocks a signer", async () => {
    const signer: Signer = {
      kind: "software",
      address: "TSender",
      sign: vi.fn(async (tx) => tx),
      signMessage: async () => "",
      signTypedData: async () => ({ signature: "", digest: "", primaryType: "" }),
    };
    const signers = {
      assertCanSign: vi.fn(),
      resolve: vi.fn(() => signer),
    } as unknown as SignerResolver;
    const result = await new TxPipeline(signers).run(params(signer, {
      mode: "build-only",
      buildOnly: true,
      prepare: (tx) => tx,
      artifact: () => "abcd",
    }));

    expect(result).toMatchObject({ stage: "built", hex: "abcd" });
    expect(signers.assertCanSign).not.toHaveBeenCalled();
    expect(signers.resolve).not.toHaveBeenCalled();
    expect(signer.sign).not.toHaveBeenCalled();
  });

  it("preflights authorization before invoking the signer", async () => {
    const order: string[] = [];
    const signer: Signer = {
      kind: "software",
      address: "TSender",
      sign: vi.fn(async (tx) => { order.push("sign"); return tx; }),
      signMessage: async () => "",
      signTypedData: async () => ({ signature: "", digest: "", primaryType: "" }),
    };
    const signers = { assertCanSign: vi.fn(), resolve: () => signer } as unknown as SignerResolver;
    await new TxPipeline(signers).run(params(signer, {
      preflight: async () => { order.push("preflight"); },
    }));
    expect(order).toEqual(["preflight", "sign"]);
  });

  it("refuses to broadcast when the preflight gate reports an unmet threshold", async () => {
    const signer: Signer = {
      kind: "software",
      address: "TSender",
      sign: vi.fn(async (tx) => tx),
      signMessage: async () => "",
      signTypedData: async () => ({ signature: "", digest: "", primaryType: "" }),
    };
    const signers = { assertCanSign: vi.fn(), resolve: () => signer } as unknown as SignerResolver;
    const broadcast = vi.fn(async () => ({ txId: "tx" }));
    await expect(new TxPipeline(signers).run(params(signer, {
      mode: "broadcast",
      broadcast: true,
      broadcaster: { broadcast } as never,
      preflight: async () => ({
        assertBroadcastable: () => { throw new ChainError("not_authorized", "signature threshold is not reached; missing 1 weight"); },
      }),
    }))).rejects.toMatchObject({ code: "not_authorized" });
    expect(broadcast).not.toHaveBeenCalled(); // the node is never asked to reject it
  });

  it("lets sign-only past the gate so a partial multi-signature can be collected", async () => {
    const signer: Signer = {
      kind: "software",
      address: "TSender",
      sign: vi.fn(async (tx) => tx),
      signMessage: async () => "",
      signTypedData: async () => ({ signature: "", digest: "", primaryType: "" }),
    };
    const signers = { assertCanSign: vi.fn(), resolve: () => signer } as unknown as SignerResolver;
    const assertBroadcastable = vi.fn(() => { throw new ChainError("not_authorized", "unmet"); });
    const outcome = await new TxPipeline(signers).run(params(signer, {
      mode: "sign-only",
      preflight: async () => ({ assertBroadcastable }),
    }));
    expect(outcome.stage).toBe("signed");
    expect(assertBroadcastable).not.toHaveBeenCalled();
  });
});
