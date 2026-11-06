import { describe, it, expect, vi } from "vitest";
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
  // These tests do not resolve a stored account.
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

describe("ExecutionContext account selection", () => {
  function ctxWithAccounts(account?: string) {
    const sm = new StreamManager(
      "json",
      false,
      () => {},
      () => {},
    );
    const accounts = {
      selectAccount: vi.fn((requested?: string) => requested ?? "wlt_a.0"),
      accountAddress: vi.fn((selected: string, family: string) => `${family}:${selected}`),
    };
    const deps = {
      config: { timeoutMs: 1 },
      streams: sm,
      formatter: createOutputFormatter("json", sm, 0),
      accounts,
    } as unknown as RuntimeDeps;
    const globals = { output: "json", verbose: false, account } as Globals;
    return { ctx: buildExecutionContext(globals, deps), accounts };
  }

  it("asks the account use case once, with the --account value", () => {
    const { ctx, accounts } = ctxWithAccounts("main");
    expect(ctx.activeAccount).toBe("main");
    expect(ctx.activeAccount).toBe("main");
    expect(accounts.selectAccount).toHaveBeenCalledExactlyOnceWith("main");
  });

  it("resolves an address through the selected account", () => {
    const { ctx, accounts } = ctxWithAccounts();
    expect(ctx.resolveAddress("tron")).toBe("tron:wlt_a.0");
    expect(accounts.accountAddress).toHaveBeenCalledWith("wlt_a.0", "tron");
  });
});
