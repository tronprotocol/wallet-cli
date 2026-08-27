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
    net: { family: "tron", nativeSymbol: "TRX" } as never,
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

    await expect(new TxPipeline(signers).run(params(signer))).rejects.toMatchObject({
      code: "timeout",
    });
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
    const result = await new TxPipeline(signers).run(
      params(signer, {
        mode: "build-only",
        buildOnly: true,
        prepare: (tx) => tx,
        artifact: () => "abcd",
      }),
    );

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
      sign: vi.fn(async (tx) => {
        order.push("sign");
        return tx;
      }),
      signMessage: async () => "",
      signTypedData: async () => ({ signature: "", digest: "", primaryType: "" }),
    };
    const signers = { assertCanSign: vi.fn(), resolve: () => signer } as unknown as SignerResolver;
    await new TxPipeline(signers).run(
      params(signer, {
        preflight: async () => {
          order.push("preflight");
        },
      }),
    );
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
    await expect(
      new TxPipeline(signers).run(
        params(signer, {
          mode: "broadcast",
          broadcast: true,
          broadcaster: { broadcast } as never,
          preflight: async () => ({
            assertBroadcastable: () => {
              throw new ChainError(
                "not_authorized",
                "signature threshold is not reached; missing 1 weight",
              );
            },
          }),
        }),
      ),
    ).rejects.toMatchObject({ code: "not_authorized" });
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
    const assertBroadcastable = vi.fn(() => {
      throw new ChainError("not_authorized", "unmet");
    });
    const outcome = await new TxPipeline(signers).run(
      params(signer, {
        mode: "sign-only",
        preflight: async () => ({ assertBroadcastable }),
      }),
    );
    expect(outcome.stage).toBe("signed");
    expect(assertBroadcastable).not.toHaveBeenCalled();
  });
});

describe("TxPipeline build-only", () => {
  // The guarantee that matters: NO signer is resolved. That is what lets --build-only run from a
  // watch-only or Ledger account and hand the unsigned hex to co-signers. It does estimate, and
  // reports `fee` — documented for every command offering the flag (docs/commands/tx/send.md).
  it("builds from the public address without resolving a signer", async () => {
    const resolve = vi.fn(() => {
      throw new Error("signer must not be resolved");
    });
    const assertCanSign = vi.fn(() => {
      throw new Error("signing must not be asserted");
    });
    const signers = { resolve, assertCanSign } as unknown as SignerResolver;
    const build = vi.fn(async (address: string) => ({ raw_data_hex: "0102", owner: address }));
    const estimate = vi.fn(async () => ({ feeSun: "1000" }));
    const artifact = vi.fn(() => "0a02010202");

    await expect(
      new TxPipeline(signers).run(
        params(
          {} as Signer,
          {
            ctx: scope({ resolveAddress: () => "TWatchOnly" }),
            buildOnly: true,
            build,
            estimate,
            artifact,
          } as Partial<TxPipelineParams>,
        ),
      ),
    ).resolves.toEqual({
      stage: "built",
      tx: { raw_data_hex: "0102", owner: "TWatchOnly" },
      hex: "0a02010202",
      fee: { feeSun: "1000" },
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(assertCanSign).not.toHaveBeenCalled();
  });

  // Producing the unsigned hex IS the point of the mode, so an adapter that cannot serialise one has
  // nothing to return — refused up front rather than yielding a hex-less "built" outcome.
  it("refuses when the adapter cannot produce transaction hex", async () => {
    const signers = { resolve: vi.fn(), assertCanSign: vi.fn() } as unknown as SignerResolver;
    await expect(
      new TxPipeline(signers).run(
        params({} as Signer, {
          ctx: scope({ resolveAddress: () => "TWatchOnly" }),
          buildOnly: true,
          build: async (address: string) => ({ raw_data_hex: "0102", owner: address }),
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid_option" });
  });
});

/**
 * `--permission-id` / `--expiration` need someone to bind them into the transaction, and that
 * someone is the `prepare` hook. An adapter that offers no hook cannot apply either option, so the
 * pipeline refuses rather than silently dropping them.
 */
describe("TxPipeline permission/expiration binding guard", () => {
  const buildOnly = {
    buildOnly: true,
    mode: "build-only" as const,
    build: async () => ({ raw_data_hex: "0102" }) as never,
    artifact: () => "0a02010202",
  };
  const signers = () => ({ resolve: vi.fn(), assertCanSign: vi.fn() }) as unknown as SignerResolver;

  it.each([
    ["--permission-id", { permissionId: 2 }],
    ["--expiration", { expiration: 60_000 }],
  ])("refuses %s when the adapter has no prepare hook", async (_label, opts) => {
    await expect(
      new TxPipeline(signers()).run(params({} as Signer, { ...buildOnly, ...opts })),
    ).rejects.toMatchObject({ code: "invalid_option" });
  });
});

/**
 * The pipeline's own broadcast path settles the same question as stageTronBroadcast: the id we
 * derived from the signed bytes outranks the one the node echoes back, and a disagreement is
 * surfaced rather than swallowed. Kept here as well as at the adapter because every family's
 * writes come through this method, so the rule travels with the Broadcaster port.
 */
describe("TxPipeline reports the transaction id derived from the signed bytes", () => {
  const LOCAL = "defbf1e676a7b53c03a30ec3e17e455175231dcf6165ae2a762d2d973f81dbc9";
  const OTHER = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

  const broadcastWith = async (nodeTxId: string) => {
    const warnings: string[] = [];
    const signer: Signer = {
      kind: "software",
      address: "TSender",
      sign: async () => ({ txID: LOCAL }) as never,
      signMessage: async () => "",
      signTypedData: async () => ({ signature: "", digest: "", primaryType: "" }),
    };
    const signers = { assertCanSign: vi.fn(), resolve: () => signer } as unknown as SignerResolver;
    const outcome = await new TxPipeline(signers).run(
      params(signer, {
        ctx: scope({ warn: (m: string) => warnings.push(String(m)) }),
        broadcast: true,
        mode: "broadcast",
        broadcaster: { broadcast: async () => ({ txId: nodeTxId }) } as never,
      }),
    );
    return { outcome, warnings };
  };

  it("prefers the derived id and warns when the node disagrees", async () => {
    const { outcome, warnings } = await broadcastWith(OTHER);
    expect(outcome).toMatchObject({ stage: "submitted", txId: LOCAL });
    expect(warnings.join(" ")).toContain(OTHER);
  });

  it("says nothing when the node agrees", async () => {
    const { outcome, warnings } = await broadcastWith(LOCAL);
    expect(outcome).toMatchObject({ txId: LOCAL });
    expect(warnings).toEqual([]);
  });
});
