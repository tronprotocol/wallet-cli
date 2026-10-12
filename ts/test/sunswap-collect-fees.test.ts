/**
 * Black-box checks for `sunswap collect-fees`.
 *
 * Refused before a key is touched and before a request would be made, so neither a funded
 * account nor a reachable node is needed. The amounts and the Collect event are covered by unit
 * tests and by the live Nile run.
 */
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
  HOME = mkdtempSync(join(tmpdir(), "wcli-fees-"));
});

function run(args: string[]) {
  const env = { ...process.env, WALLET_CLI_HOME: HOME } as Record<string, string>;
  delete env.MASTER_PASSWORD;
  const r = spawnSync(process.execPath, [...ENTRY_ARGS, ...args], {
    encoding: "utf8",
    env,
    timeout: 25_000,
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

describe("protocol", () => {
  /**
   * V2's fees are real; they are simply not separable — they accrue into the LP token's own
   * value. "Unknown protocol" would send a caller looking for a spelling error instead of
   * telling them how a V2 pool works.
   */
  it("refuses V2 by explaining that its fees are not separable", () => {
    const r = run([
      "sunswap",
      "collect-fees",
      "--protocol",
      "V2",
      "--position-id",
      "686",
      "--network",
      "nile",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
    expect(r.json.error.message).toContain("accrue into the LP token itself");
    expect(r.json.error.message).toContain("nothing separate to claim");
    expect(r.json.error.message).toContain("V3 or V4");
  });

  /**
   * V4 is served now. This case used to assert it was refused as "not supported yet"; that
   * sentence is gone from the CLI, so the check that replaces it is the one V4 still owes a
   * caller — the flags it does not have.
   */
  it("refuses --recipient on V4 rather than sending the fees to the account anyway", () => {
    const r = run([
      "sunswap",
      "collect-fees",
      "--protocol",
      "V4",
      "--position-id",
      "1",
      "--recipient",
      "TM56HhEWoaw2UevQh86k9AUjJqj9QVvmFC",
      "--network",
      "nile",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
  });

  // The pair is an optional cross-check on V4; half of it names no pair at all.
  it("refuses a half-named pair on V4", () => {
    const r = run([
      "sunswap",
      "collect-fees",
      "--protocol",
      "V4",
      "--position-id",
      "1",
      "--token0",
      "TRX",
      "--network",
      "nile",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("missing_option");
  });
});

describe("required options", () => {
  it("requires --position-id", () => {
    const r = run([
      "sunswap",
      "collect-fees",
      "--protocol",
      "V3",
      "--network",
      "nile",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("missing_option");
  });

  /**
   * Three refusals, two reasons. `--liquidity` is refused on either protocol because there is no
   * partial collect: the contract takes what is owed, in full. `--token0` and `--deadline` are
   * V4's own, and on a V3 collection the position already names the pair and the call carries no
   * deadline.
   */
  it.each([
    ["--liquidity", "1"],
    ["--token0", "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"],
    ["--deadline", "1790000000"],
  ])("does not accept %s on V3", (flag, value) => {
    const r = run([
      "sunswap",
      "collect-fees",
      "--protocol",
      "V3",
      "--position-id",
      "686",
      flag,
      value,
      "--network",
      "nile",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
  });
});

describe("network availability", () => {
  it("refuses shasta and names where the command does work", () => {
    const r = run([
      "sunswap",
      "collect-fees",
      "--protocol",
      "V3",
      "--position-id",
      "686",
      "--dry-run",
      "--network",
      "shasta",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("unsupported_network_capability");
    expect(r.json.error.message).toBe("sunswap collect-fees is available on tron and nile only");
  });
});

describe("help", () => {
  it("says it collects everything, and why V2 is absent", () => {
    const r = run(["sunswap", "collect-fees", "--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("--position-id");
    expect(r.stdout).toContain("--recipient");
    expect(r.stdout).toContain("EVERYTHING owed");
    expect(r.stdout).toContain("V3 and V4 only");
    expect(r.stdout).not.toContain("--liquidity");
    expect(r.stdout).not.toContain("--sign-only");
  });

  /**
   * Rewritten: this case used to assert the help said a V4 receipt reports NO amount. V4 now
   * reads the LP fee helper and publishes what it says, so that sentence is gone. What replaces
   * it is the part a caller still has to learn here — that an unreadable helper produces a
   * receipt with no amount rather than a zero, and where the figure can be found instead.
   */
  it("says an unreadable amount is reported as no amount, and where one can be found", () => {
    const r = run(["sunswap", "collect-fees", "--help"]);
    expect(r.stdout).toContain("--token0");
    expect(r.stdout).toContain("--deadline");
    expect(r.stdout).toContain("NO amount");
    expect(r.stdout).not.toContain("does NOT report an amount");
    expect(r.stdout).toContain("position-list");
  });
});
