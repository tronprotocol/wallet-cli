import { describe, it, expect } from "vitest";
import { StreamManager } from "./index.js";
import { AtomicFileStore } from "../../../outbound/persistence/fs/index.js";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function capture(output: "text" | "json", verbose = false) {
  const out: string[] = [];
  const err: string[] = [];
  const sm = new StreamManager(output, verbose, (s) => out.push(s), (s) => err.push(s));
  return { sm, out, err };
}

describe("StreamManager", () => {
  it("writes result to stdout exactly once", () => {
    const { sm, out } = capture("json");
    sm.result("{}");
    expect(out).toEqual(["{}\n"]);
    expect(() => sm.result("{}")).toThrow(/more than once/);
  });

  it("routes diagnostics to stderr, never stdout", () => {
    const { sm, out, err } = capture("text");
    sm.diagnostic("info", "hello");
    expect(out).toEqual([]);
    expect(err).toEqual(["hello\n"]);
  });

  it("debug diagnostics need verbose", () => {
    const v = capture("text", false);
    v.sm.diagnostic("debug", "d");
    expect(v.err).toEqual([]);

    const vv = capture("text", true);
    vv.sm.diagnostic("debug", "d");
    expect(vv.err).toEqual(["d\n"]);
  });

  it("captures warnings for meta.warnings; only prints them to stderr in text mode", () => {
    const j = capture("json");
    j.sm.diagnostic("warn", "careful");
    expect(j.err).toEqual([]);
    expect(j.sm.warnings()).toEqual(["careful"]);

    const t = capture("text");
    t.sm.diagnostic("warn", "careful");
    expect(t.err).toEqual(["warning: careful\n"]);
  });

  it("event writes an intermediate frame as a plain line to stderr, never stdout", () => {
    const { sm, out, err } = capture("json");
    sm.event('{"type":"signed"}');
    expect(out).toEqual([]); // stdout stays reserved for the single terminal frame
    expect(err).toEqual(['{"type":"signed"}\n']);
  });

  it("event skips a null frame and does not count against result()", () => {
    const { sm, out, err } = capture("json");
    sm.event(null);
    expect(err).toEqual([]);
    sm.event('{"type":"broadcasting"}');
    sm.result("{}"); // still allowed: events are not terminal frames
    expect(out).toEqual(["{}\n"]);
    expect(err).toEqual(['{"type":"broadcasting"}\n']);
  });

  it("event writes even when debug diagnostics are disabled", () => {
    const { sm, err } = capture("text", false);
    sm.event("⧖ approve on your device");
    expect(err).toEqual(["⧖ approve on your device\n"]);
  });
});

describe("AtomicFileStore", () => {
  it("round-trips JSON and returns null for missing files", () => {
    const dir = mkdtempSync(join(tmpdir(), "afs-"));
    const fs = new AtomicFileStore();
    const p = join(dir, "nested", "data.json");
    expect(fs.readJson(p)).toBeNull();
    fs.writeJson(p, { a: 1 });
    expect(fs.readJson<{ a: number }>(p)).toEqual({ a: 1 });
    expect(readFileSync(p, "utf8")).toContain('"a": 1');
  });

  it("runs a critical section under a lock and releases it", () => {
    const dir = mkdtempSync(join(tmpdir(), "afs-"));
    const fs = new AtomicFileStore();
    const p = join(dir, "x.json");
    const r = fs.withLock(p, () => 42);
    expect(r).toBe(42);
    // lock released → can acquire again
    expect(fs.withLock(p, () => "ok")).toBe("ok");
  });

  it("steals a stale lock left by a dead process (no permanent brick)", () => {
    const dir = mkdtempSync(join(tmpdir(), "afs-"));
    const fs = new AtomicFileStore();
    const p = join(dir, "y.json");
    // simulate a crashed holder: a lockfile owned by a PID that is not alive
    writeFileSync(`${p}.lock`, "999999999\n");
    const r = fs.withLock(p, () => "recovered", { timeoutMs: 2000 });
    expect(r).toBe("recovered");
  });
});
