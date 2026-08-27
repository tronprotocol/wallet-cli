import { describe, it, expect, beforeEach } from "vitest";
import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DETACHED } from "./detached.js";

const ENTRY = join(process.cwd(), "src", "index.ts");

let HOME: string;
beforeEach(() => {
  HOME = mkdtempSync(join(tmpdir(), "wcli-unknown-"));
});

function run(args: string[]) {
  const env = { ...process.env, WALLET_CLI_HOME: HOME } as Record<string, string>;
  delete env.MASTER_PASSWORD;
  const r = spawnSync(process.execPath, ["--import", "tsx", ENTRY, ...args], {
    encoding: "utf8",
    env,
    timeout: 18_000,
    ...DETACHED,
  } as SpawnSyncOptionsWithStringEncoding);
  let json: any;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* not json */
  }
  return { stdout: r.stdout, stderr: r.stderr, status: r.status, json };
}

/**
 * A mistyped command must fail the same way whether or not `--help` is on the line.
 *
 * Dispatch already got this right (`unknown_command`, exit 2). The meta path did not: any token
 * matching --help / --json-schema short-circuited into HelpService, which fell back to the ROOT
 * listing and returned 0. So `wallet-cli tx snd --help` printed a plausible page and reported
 * success — for an agent-first CLI that is the worst possible answer, because the caller has
 * nothing to branch on and a full help page that looks like it answered the question.
 */
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
      // and it must NOT hand back a help page as if it had understood
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

  /**
   * Appending --help to a command you were already typing is the most common way anyone reaches
   * help, and the line still carries its arguments. `metaPositionals` only knows which GLOBAL
   * flags take a value, so a command flag's value (`--to T...` → "T...") stays in the path — as
   * do real positionals. The longest prefix that names a command wins; the rest are arguments.
   */
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

  // ...but a prefix that is only a GROUP must not rescue a bad verb: `tx` is not a command,
  // so `tx bogus` has no resolvable prefix and stays an error.
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

  // The paths that legitimately return a listing must keep doing so.
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
