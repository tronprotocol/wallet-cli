import { describe, it, expect } from "vitest";
import { buildExecutionContext, RuntimeDeps } from "./index.js";
import { StreamManager } from "../stream/index.js";
import { createOutputFormatter } from "../output/index.js";
import type { Globals } from "../contracts/index.js";

function ctxWith(output: "text" | "json", overrides: Partial<Globals> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const sm = new StreamManager(
    output,
    false,
    (s) => out.push(s),
    (s) => err.push(s),
  );
  const formatter = createOutputFormatter(output, sm, 0);
  const globals = { output, verbose: false, ...overrides } as Globals;
  // only streams + formatter are exercised by emit(); the rest is lazily used elsewhere.
  const deps = { config: { timeoutMs: 1 }, streams: sm, formatter } as unknown as RuntimeDeps;
  return { ctx: buildExecutionContext(globals, deps), out, err };
}

describe("ExecutionContext.emit (progress events)", () => {
  it("routes a json event through formatter+streams to stderr, never stdout", () => {
    const { ctx, out, err } = ctxWith("json");
    ctx.emit({ type: "awaiting_device", reason: "sign" });
    expect(out).toEqual([]);
    expect(JSON.parse(err[0]!)).toEqual({ type: "awaiting_device", reason: "sign" });
  });

  it("renders a human line in text mode", () => {
    const { ctx, err } = ctxWith("text");
    ctx.emit({ type: "broadcasting" });
    expect(err[0]).toContain("broadcasting");
  });
});

describe("ExecutionContext direct address target", () => {
  it("resolves a valid --account address without requiring a local wallet record", () => {
    const address = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
    const { ctx } = ctxWith("json", { account: address });
    expect(ctx.activeAccount).toBe(address);
    expect(ctx.resolveAddress("tron")).toBe(address);
  });
});

// The single-family guard used to live in TargetResolver, firing when a NETWORK was resolved.
// That was the wrong moment: `current` resolves one (to choose which family's QR to draw) yet
// never demands a single family's address, and was refused for a condition that did not apply to
// it. The guard now fires here — where an address is actually demanded — still before any RPC.
describe("resolveAddress on a family the account does not have", () => {
  const EVM = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

  function ctxForEvmWatch() {
    const sm = new StreamManager(
      "json",
      false,
      () => {},
      () => {},
    );
    const deps = {
      config: { timeoutMs: 1 },
      streams: sm,
      formatter: createOutputFormatter("json", sm, 0),
      keystore: {
        activeAccount: () => "wlt_w",
        resolveAccount: () => ({
          wallet: { id: "wlt_w", source: { type: "watch", family: "evm", address: EVM } },
          index: -1,
        }),
      },
    } as unknown as RuntimeDeps;
    return buildExecutionContext({ output: "json", verbose: false } as Globals, deps);
  }

  it("reports family_mismatch rather than a bare missing address", () => {
    let code: string | undefined;
    try {
      ctxForEvmWatch().resolveAddress("tron");
    } catch (e) {
      code = (e as { code?: string }).code;
    }
    expect(code).toBe("family_mismatch");
  });

  // This is the one error where the user has done nothing wrong — the account simply lives on
  // another chain — so the message has to carry the way out.
  it("names the account's own family and how to switch", () => {
    expect(() => ctxForEvmWatch().resolveAddress("tron")).toThrow(/evm/);
    expect(() => ctxForEvmWatch().resolveAddress("tron")).toThrow(/--network|defaultNetwork/);
  });

  it("still returns the address for a family the account does have", () => {
    expect(ctxForEvmWatch().resolveAddress("evm")).toBe(EVM);
  });
});
