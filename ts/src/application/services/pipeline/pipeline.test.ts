import { describe, it, expect, vi } from "vitest";
import { TxPipeline, type TronTxPipelineParams } from "./index.js";
import type { SignerResolver } from "../signer/index.js";
import type {
  FeeReport,
  Signer,
  TronTransactionArtifact,
  UnsignedTx,
} from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import { ChainError, classifyError, errorMessage } from "../../../domain/errors/index.js";
import { SigningService } from "../signing/signing-service.js";

function scope(over: Partial<TransactionScope> = {}): TransactionScope {
  return {
    deadline: new CommandDeadline(0),
    wait: undefined,
    activeAccount: "acct" as never,
    resolveAddress: () => "TSender",
    emit: () => {},
    warn: () => {},
    ...over,
  } as TransactionScope;
}

function params(signer: Signer, over: Partial<TronTxPipelineParams> = {}): TronTxPipelineParams {
  return {
    ctx: scope(),
    net: { family: "tron", nativeSymbol: "TRX" } as never,
    account: "acct" as never,
    broadcaster: { broadcast: async () => ({ txId: "tx" }) } as never,
    build: async () => ({}) as never,
    estimate: async () => ({}) as never,
    mode: "sign-only",
    permissionId: 0,
    prepare: (tx) => tx,
    prepareForSigning: (tx) => tx,
    assertNotExpired: () => {},
    artifact: () => "hex",
    preflight: null,
    confirm: async () => undefined,
    ...over,
  };
}

describe("TxPipeline device-sign timeout", () => {
  it("bounds a hung device signature by the command deadline and aborts the signal", async () => {
    let captured: AbortSignal | undefined;
    const signer: Signer = {
      kind: "device",
      address: "TSender",
      precheck: vi.fn(async () => {}),
      sign: (_tx, opts) => {
        captured = opts.signal;
        return new Promise(() => {});
      },
      signMessage: async () => "",
      signTypedData: async () => ({ signature: "", digest: "", primaryType: "" }),
    };
    const signers = { assertCanSign: () => {}, resolve: () => signer } as unknown as SignerResolver;

    await expect(
      new TxPipeline(signers, new SigningService({} as never)).runTron(
        params(signer, { ctx: scope({ deadline: new CommandDeadline(250) }) }),
      ),
    ).rejects.toBeInstanceOf(DeadlineExpiredError);
    expect(captured?.aborted).toBe(true);
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
    const result = await new TxPipeline(signers, new SigningService({} as never)).runTron(
      params(signer, {
        mode: "build-only",
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
    await new TxPipeline(signers, new SigningService({} as never)).runTron(
      params(signer, {
        preflight: async () => {
          order.push("preflight");
          return { assertBroadcastable: () => {} };
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
      new TxPipeline(signers, new SigningService({} as never)).runTron(
        params(signer, {
          mode: "broadcast",
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
    expect(broadcast).not.toHaveBeenCalled();
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
    const outcome = await new TxPipeline(signers, new SigningService({} as never)).runTron(
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
  it("builds from the public address without resolving a signer", async () => {
    const resolve = vi.fn(() => {
      throw new Error("signer must not be resolved");
    });
    const assertCanSign = vi.fn(() => {
      throw new Error("signing must not be asserted");
    });
    const signers = { resolve, assertCanSign } as unknown as SignerResolver;
    const build = vi.fn(
      async (address: string) =>
        ({ raw_data_hex: "0102", owner: address }) as unknown as UnsignedTx,
    );
    const estimate = vi.fn(async () => ({ feeSun: "1000" }) as unknown as FeeReport);
    const artifact = vi.fn(() => "0a02010202");

    await expect(
      new TxPipeline(signers, new SigningService({} as never)).runTron(
        params(
          {} as Signer,
          {
            ctx: scope({ deadline: NO_DEADLINE, resolveAddress: () => "TWatchOnly" }),
            mode: "build-only",
            build,
            estimate,
            artifact,
          } as Partial<TronTxPipelineParams>,
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
});

describe("TxPipeline EVM entry", () => {
  const signers = () => ({ resolve: vi.fn(), assertCanSign: vi.fn() }) as unknown as SignerResolver;

  it.each([
    ["permissionId", { permissionId: 2 }],
    ["expiration", { expiration: 60_000 }],
  ])("refuses a non-default %s", async (_label, opts) => {
    await expect(
      new TxPipeline(signers(), new SigningService({} as never)).runEvm({
        ...params({} as Signer),
        net: { family: "evm" } as never,
        mode: "build-only",
        build: async () => ({}) as never,
        ...opts,
      } as never),
    ).rejects.toMatchObject({ code: "invalid_option" });
  });
});

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
    const outcome = await new TxPipeline(signers, new SigningService({} as never)).runTron(
      params(signer, {
        ctx: scope({ wait: false, warn: (m: string) => warnings.push(String(m)) }),
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

import { tronTransactionHooks } from "../../use-cases/tron/multisig-authorization.js";
import type { TronGateway } from "../../ports/chain/tron/tron-gateway.js";
import { DeadlineExpiredError } from "../../contracts/deadline.js";
import { CommandDeadline, SUBMIT_ADMISSION_RESERVE_MS } from "../command-deadline.js";
import {
  cliMessage,
  errorEnvelope,
  exitCodeOf,
} from "../../../adapters/inbound/cli/output/errors.js";

const NO_DEADLINE = new CommandDeadline(0);

describe("TRON signing lifetime", () => {
  it.each([false, true])(
    "extends only a fresh device transaction without explicit expiration (explicit=%s)",
    async (explicit) => {
      const now = 1_900_000_000_000;
      const clock = vi.spyOn(Date, "now").mockReturnValue(now);
      const tx = {
        raw_data: { timestamp: now, expiration: now + 60_000, contract: [{}] },
      } as unknown as TronTransactionArtifact;
      const prepare = vi.fn((value: typeof tx, options: { expiration?: number }) => ({
        ...value,
        raw_data: {
          ...value.raw_data,
          expiration:
            options.expiration === undefined
              ? value.raw_data.expiration
              : value.raw_data.timestamp! + options.expiration,
        },
      }));
      const gateway = {
        prepareTransaction: prepare,
        encodeTransactionHex: () => "hex",
      } as unknown as TronGateway;
      const signer = {
        kind: "device",
        address: "TSender",
        sign: vi.fn(async (value) => value),
      } as unknown as Signer;
      const signers = {
        assertCanSign: () => {},
        resolve: () => signer,
      } as unknown as SignerResolver;
      try {
        await new TxPipeline(signers, new SigningService({} as never)).runTron(
          params(signer, {
            ...tronTransactionHooks(gateway),
            build: async () => tx,
            ctx: scope({ deadline: new CommandDeadline(0) }),
            ...(explicit ? { expiration: 90_000 } : {}),
          }),
        );
        const signed = vi.mocked(signer.sign).mock.calls[0]![0] as typeof tx;
        expect(signed.raw_data.expiration).toBe(explicit ? now + 90_000 : now + 600_000);
        expect(tx.raw_data.expiration).toBe(now + 60_000);
      } finally {
        clock.mockRestore();
      }
    },
  );
  it("refuses a transaction that expires while signing instead of broadcasting or signing it again", async () => {
    const now = 1_900_000_000_000;
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const tx = {
      raw_data: { timestamp: now, expiration: now + 60_000, contract: [{}] },
    } as unknown as TronTransactionArtifact;
    const gateway = {
      prepareTransaction: (value: unknown) => value,
      encodeTransactionHex: () => "hex",
    } as unknown as TronGateway;
    const signer = {
      kind: "software",
      address: "TSender",
      sign: vi.fn(async (value) => {
        clock.mockReturnValue(now + 60_001);
        return value;
      }),
    } as unknown as Signer;
    const broadcast = vi.fn(async () => ({ txId: "tx" }));
    try {
      await expect(
        new TxPipeline(
          {
            assertCanSign: () => {},
            resolve: () => signer,
          } as unknown as SignerResolver,
          new SigningService({} as never),
        ).runTron(
          params(signer, {
            ...tronTransactionHooks(gateway),
            build: async () => tx,
            mode: "broadcast",
            broadcaster: { broadcast },
          }),
        ),
      ).rejects.toMatchObject({ code: "tx_expired" });
      expect(broadcast).not.toHaveBeenCalled();
      expect(signer.sign).toHaveBeenCalledTimes(1);
    } finally {
      clock.mockRestore();
    }
  });
});

describe("TxPipeline submission outcome", () => {
  const txId = "defbf1e676a7b53c03a30ec3e17e455175231dcf6165ae2a762d2d973f81dbc9";
  function harness(signed: unknown = { txID: txId }) {
    const signer = {
      kind: "software",
      address: "TSender",
      sign: vi.fn(async () => signed),
    } as unknown as Signer;
    const pipeline = new TxPipeline(
      {
        assertCanSign: vi.fn(),
        resolve: () => signer,
      } as unknown as SignerResolver,
      new SigningService({} as never),
    );
    const broadcast = vi.fn(async (_signed: unknown) => ({ txId }));
    const input = params(signer, { mode: "broadcast", broadcaster: { broadcast } });
    return { pipeline, broadcast, input, signer };
  }

  it.each(["timeout", "rpc_error", "invalid_node_response"])(
    "retains the signed ID and error representation on %s",
    async (code) => {
      const h = harness();
      const original = new ChainError(code, errorMessage`node: ${"untrusted\nvalue"}`, {
        nodeCode: "fixture",
      });
      h.broadcast.mockRejectedValueOnce(original);
      const error = classifyError(await h.pipeline.runTron(h.input).catch((e) => e));
      expect(errorEnvelope(error)).toEqual({
        code,
        message: original.message,
        details: { nodeCode: "fixture", txId, outcome: "unknown" },
      });
      expect(error.textMessage).toBe(original.textMessage);
      expect(error.kind).toBe(original.kind);
      expect(exitCodeOf(error)).toBe(exitCodeOf(original));
      expect(h.broadcast).toHaveBeenCalledWith({ txID: txId }, expect.anything());
    },
  );

  it.each(["transaction_rejected", "not_authorized", "tx_expired", "dry_run_violation"])(
    "does not attach an ID to %s",
    async (code) => {
      const h = harness();
      const original = new ChainError(code, "refused");
      h.broadcast.mockRejectedValueOnce(original);
      await expect(h.pipeline.runTron(h.input)).rejects.toBe(original);
      expect(original.details).toBeUndefined();
    },
  );

  it("confirms a transaction the node already knew and keeps alreadyKnown", async () => {
    const h = harness();
    h.broadcast.mockResolvedValueOnce({ txId, alreadyKnown: true } as never);
    const confirm = vi.fn(async () => ({ confirmed: true as const, failed: true, blockNumber: 7 }));
    const outcome = await h.pipeline.runTron({ ...h.input, confirm });
    expect(confirm).toHaveBeenCalledWith(txId, { txID: txId });
    expect(outcome).toMatchObject({ stage: "failed", txId, alreadyKnown: true, blockNumber: 7 });
  });

  it("does not invent an ID when the signed payload has none", async () => {
    const h = harness({});
    const original = new ChainError("timeout", "lost response", { nodeCode: "fixture" });
    h.broadcast.mockRejectedValueOnce(original);
    const error = (await h.pipeline.runTron(h.input).catch((e) => e)) as ChainError;
    expect(error.details).toEqual({ nodeCode: "fixture", outcome: "unknown" });
  });

  it.each(["build", "estimate", "preflight", "sign", "expiry", "authorization"])(
    "does not label a pre-submit %s error",
    async (step) => {
      const h = harness();
      const original = new ChainError("timeout", "before submission");
      const fail = () => {
        throw original;
      };
      if (step === "build") h.input.build = fail;
      if (step === "estimate") h.input.estimate = fail;
      if (step === "preflight") h.input.preflight = fail;
      if (step === "sign") vi.mocked(h.signer.sign).mockImplementation(fail);
      if (step === "expiry")
        h.input.assertNotExpired = vi
          .fn()
          .mockImplementationOnce(() => {})
          .mockImplementationOnce(fail);
      if (step === "authorization") h.input.preflight = async () => ({ assertBroadcastable: fail });
      await expect(h.pipeline.runTron(h.input)).rejects.toBe(original);
      expect(original.details).toBeUndefined();
      expect(h.broadcast).not.toHaveBeenCalled();
    },
  );

  it("does not submit during dry-run", async () => {
    const h = harness();
    await expect(h.pipeline.runTron({ ...h.input, mode: "dry-run" })).resolves.toMatchObject({
      stage: "plan",
    });
    expect(h.broadcast).not.toHaveBeenCalled();
    expect(h.signer.sign).not.toHaveBeenCalled();
  });
});

describe("TxPipeline TRON entry runs every lifecycle step for its mode", () => {
  function tracked(mode: TronTxPipelineParams["mode"]) {
    const calls: string[] = [];
    const signer = {
      kind: "device",
      address: "TSender",
      sign: vi.fn(async (tx: unknown) => {
        calls.push("sign");
        return tx;
      }),
    } as unknown as Signer;
    const signers = { assertCanSign: vi.fn(), resolve: () => signer } as unknown as SignerResolver;
    const input = params(signer, {
      mode,
      ctx: scope({ wait: mode === "broadcast" ? true : undefined }),
      build: async () => {
        calls.push("build");
        return { txID: "aa" } as never;
      },
      prepare: (tx, options) => {
        calls.push(`prepare:${options.permissionId}`);
        return tx;
      },
      estimate: async () => {
        calls.push("estimate");
        return {} as FeeReport;
      },
      prepareForSigning: (tx) => {
        calls.push("prepareForSigning");
        return tx;
      },
      assertNotExpired: () => {
        calls.push("assertNotExpired");
      },
      preflight: async () => {
        calls.push("preflight");
        return { assertBroadcastable: () => calls.push("assertBroadcastable") };
      },
      artifact: () => {
        calls.push("artifact");
        return "hex";
      },
      broadcaster: {
        broadcast: async () => {
          calls.push("broadcast");
          return { txId: "aa" };
        },
      } as never,
      confirm: async () => {
        calls.push("confirm");
        return { confirmed: true, failed: false };
      },
    });
    return { pipeline: new TxPipeline(signers, new SigningService({} as never)), input, calls };
  }

  it.each([
    ["dry-run", ["build", "prepare:0", "estimate"]],
    ["build-only", ["build", "prepare:0", "estimate", "artifact"]],
    [
      "sign-only",
      [
        "build",
        "prepare:0",
        "estimate",
        "prepareForSigning",
        "assertNotExpired",
        "preflight",
        "sign",
        "assertNotExpired",
        "artifact",
      ],
    ],
    [
      "broadcast",
      [
        "build",
        "prepare:0",
        "estimate",
        "prepareForSigning",
        "assertNotExpired",
        "preflight",
        "sign",
        "assertNotExpired",
        "assertBroadcastable",
        "broadcast",
        "confirm",
      ],
    ],
  ] as const)("%s", async (mode, expected) => {
    const h = tracked(mode);
    await h.pipeline.runTron(h.input);
    expect(h.calls).toEqual(expected);
  });

  it.each([
    [undefined, "confirmed"],
    [true, "confirmed"],
    [false, "submitted"],
  ] as const)("broadcast with wait intent %s returns %s", async (wait, stage) => {
    const h = tracked("broadcast");
    const outcome = await h.pipeline.runTron({ ...h.input, ctx: scope({ wait }) });
    expect(outcome.stage).toBe(stage);
    expect(h.calls.filter((c) => c === "broadcast")).toHaveLength(1);
    expect(h.calls.includes("confirm")).toBe(stage === "confirmed");
  });

  it.each(["dry-run", "build-only", "sign-only"] as const)(
    "%s runs normally without a wait intent and refuses an explicit one before building",
    async (mode) => {
      const plain = tracked(mode);
      await plain.pipeline.runTron({ ...plain.input, ctx: scope({ wait: undefined }) });
      expect(plain.calls).not.toContain("broadcast");
      for (const wait of [true, false]) {
        const h = tracked(mode);
        await expect(
          h.pipeline.runTron({ ...h.input, ctx: scope({ wait }) }),
        ).rejects.toMatchObject({ code: "invalid_option" });
        expect(h.calls).toEqual([]);
      }
    },
  );

  it("keeps a caller-set expiration instead of extending it for a device", async () => {
    const h = tracked("sign-only");
    await h.pipeline.runTron({ ...h.input, expiration: 90_000 });
    expect(h.calls).not.toContain("prepareForSigning");
  });
});

describe("TxPipeline under the command deadline", () => {
  const software = {
    kind: "software",
    address: "TSender",
    sign: async (tx: unknown) => tx,
  } as unknown as Signer;
  const signers = { assertCanSign: () => {}, resolve: () => software } as unknown as SignerResolver;
  const pipeline = () => new TxPipeline(signers, new SigningService({} as never));
  const at = (remainingMs: number) => {
    const clock = { now: () => 0 };
    const deadline = new CommandDeadline(10_000, 0, clock);
    deadline.dispose();
    clock.now = () => 10_000 - remainingMs;
    return { deadline, clock };
  };

  it.each([
    [SUBMIT_ADMISSION_RESERVE_MS - 1, false],
    [SUBMIT_ADMISSION_RESERVE_MS, true],
  ])("with %s ms left admits the submit: %s", async (remaining, admitted) => {
    const broadcast = vi.fn(async () => ({ txId: "tx" }));
    const run = pipeline().runTron(
      params(software, {
        mode: "broadcast",
        ctx: scope({ deadline: at(remaining).deadline }),
        broadcaster: { broadcast } as never,
      }),
    );
    if (admitted) {
      await expect(run).resolves.toMatchObject({ stage: "submitted", txId: "tx" });
    } else {
      const error = await run.catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DeadlineExpiredError);
      expect((error as DeadlineExpiredError).details).toBeUndefined();
    }
    expect(broadcast).toHaveBeenCalledTimes(admitted ? 1 : 0);
  });

  it("builds nothing further once the deadline expired during build", async () => {
    const { deadline, clock } = at(10_000);
    const estimate = vi.fn(async () => ({}) as never);
    await expect(
      pipeline().runTron(
        params(software, {
          mode: "broadcast",
          ctx: scope({ deadline }),
          build: async () => {
            clock.now = () => 10_000;
            return {} as never;
          },
          estimate,
        }),
      ),
    ).rejects.toBeInstanceOf(DeadlineExpiredError);
    expect(estimate).not.toHaveBeenCalled();
  });

  it("returns the submitted receipt with a warning when the deadline ends the wait", async () => {
    const warnings: string[] = [];
    const out = await pipeline().runTron(
      params(software, {
        mode: "broadcast",
        ctx: scope({
          wait: true,
          deadline: at(5_000).deadline,
          warn: (m) => warnings.push(cliMessage(m as never).message),
        }),
        confirm: async () => undefined,
      }),
    );
    expect(out).toMatchObject({ stage: "submitted", txId: "tx" });
    expect(warnings).toEqual([
      "tx not confirmed before the command's time limit; returning submitted (it may still confirm on-chain)",
    ]);
  });

  it("returns the submitted receipt with the code when waiting stops on a non-retryable error", async () => {
    const warn = vi.fn();
    const out = await pipeline().runTron(
      params(software, {
        mode: "broadcast",
        ctx: scope({ wait: true, warn }),
        confirm: async () => {
          throw new ChainError("not_found", "gone");
        },
      }),
    );
    expect(out).toMatchObject({ stage: "submitted", txId: "tx" });
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ code: "not_found" }));
  });
});
