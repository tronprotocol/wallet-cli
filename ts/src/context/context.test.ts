import { describe, it, expect } from "vitest";
import { buildExecutionContext, type RuntimeDeps } from "./index.js";
import { StreamManager } from "../stream/index.js";
import { createOutputFormatter } from "../output/index.js";
import type { Globals } from "../types/index.js";

function ctxWith(output: "text" | "json") {
  const out: string[] = [];
  const err: string[] = [];
  const sm = new StreamManager(output, false, false, (s) => out.push(s), (s) => err.push(s));
  const formatter = createOutputFormatter(output, sm, 0);
  const globals = { output, quiet: false, verbose: false, noDeviceWait: false } as Globals;
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
