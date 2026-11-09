import { describe, it, expect, beforeEach } from "vitest";
import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DETACHED } from "./detached.js";

const ENTRY_ARGS = process.env.WALLET_CLI_TEST_ENTRY
  ? [process.env.WALLET_CLI_TEST_ENTRY]
  : ["--import", "tsx", join(process.cwd(), "src", "index.ts")];

let HOME: string;
beforeEach(() => {
  HOME = mkdtempSync(join(tmpdir(), "wcli-unknown-"));
});

function run(args: string[]) {
  const env = { ...process.env, WALLET_CLI_HOME: HOME } as Record<string, string>;
  delete env.MASTER_PASSWORD;
  const r = spawnSync(process.execPath, [...ENTRY_ARGS, ...args], {
    encoding: "utf8",
    env,
    timeout: 18_000,
    ...DETACHED,
  } as SpawnSyncOptionsWithStringEncoding);
  let json: any;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* not JSON */
  }
  return { stdout: r.stdout, stderr: r.stderr, status: r.status, json };
}

describe("unknown commands fail identically with and without --help", () => {
  const unknown: string[][] = [
    ["bogus"],
    ["tx", "bogus"],
    ["account", "bogus"],
    ["contract", "nope"],
  ];

  it("exits 2 with unknown_command for a bad path (no meta flag)", () => {
    for (const path of unknown) {
      const r = run(path);
      expect(r.status, path.join(" ")).toBe(2);
      expect(r.stderr, path.join(" ")).toContain("unknown_command");
    }
  });

  it("exits 2 with unknown_command for the same path plus --help", () => {
    for (const path of unknown) {
      const r = run([...path, "--help"]);
      expect(r.status, path.join(" ")).toBe(2);
      expect(r.stderr, path.join(" ")).toContain("unknown_command");
      expect(r.stdout, path.join(" ")).not.toContain("Usage:");
    }
  });

  it("exits 2 for the same path plus --json-schema, instead of dumping the full catalog", () => {
    for (const path of unknown) {
      const r = run([...path, "--json-schema"]);
      expect(r.status, path.join(" ")).toBe(2);
      expect(r.json?.commands, path.join(" ")).toBeUndefined();
    }
  });

  it("names the path the user actually typed", () => {
    const r = run(["tx", "bogus", "--help"]);
    expect(r.stderr).toContain("tx bogus");
  });

  it("reports the failure through the JSON envelope under -o json", () => {
    const r = run(["-o", "json", "tx", "bogus", "--help"]);
    expect(r.status).toBe(2);
    expect(r.json?.ok ?? r.json?.success).toBe(false);
    expect(JSON.stringify(r.json)).toContain("unknown_command");
  });

  it("serves the command's own help when arguments are still on the line", () => {
    for (const [args, usage] of [
      [["tx", "send", "--to", "T...", "--help"], "wallet-cli tx send"],
      [["block", "123", "--help"], "wallet-cli block"],
      [["contract", "clear-abi", "TQ5...", "--help"], "wallet-cli contract clear-abi"],
      [["token", "add", "--contract", "TR7...", "--help"], "wallet-cli token add"],
    ] as [string[], string][]) {
      const r = run(args);
      expect(r.status, args.join(" ")).toBe(0);
      expect(r.stdout, args.join(" ")).toContain(usage);
    }
  });

  it("does not let a group prefix mask a mistyped verb", () => {
    for (const args of [
      ["tx", "bogus", "--help"],
      ["account", "bogus", "--help"],
    ]) {
      const r = run(args);
      expect(r.status, args.join(" ")).toBe(2);
      expect(r.stderr, args.join(" ")).toContain("unknown_command");
    }
  });

  it("still serves root, group and leaf help", () => {
    for (const args of [
      ["--help"],
      ["tx", "--help"],
      ["import", "--help"],
      ["tx", "send", "--help"],
      ["block", "--help"],
    ]) {
      const r = run(args);
      expect(r.status, args.join(" ")).toBe(0);
      expect(r.stdout, args.join(" ")).toContain("Usage:");
    }
  });

  it("still serves the machine catalog and per-command schema", () => {
    expect(run(["--json-schema"]).status).toBe(0);
    expect(run(["--json-schema"]).json?.commands?.length).toBeGreaterThan(0);
    expect(run(["tx", "send", "--json-schema"]).status).toBe(0);
    expect(run(["--version"]).status).toBe(0);
  });
});
