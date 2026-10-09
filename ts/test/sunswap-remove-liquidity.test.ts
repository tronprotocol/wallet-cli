/**
 * Black-box checks for `sunswap remove-liquidity`.
 *
 * Every case here is refused before a key is touched and before a request would be made, so the
 * suite needs neither a funded account nor a reachable node. What needs the chain — the amounts,
 * the multicall, the principal/fee split — is covered by unit tests and by the live Nile run,
 * because pinning a golden file to a pool whose reserves move every block would fail for the
 * wrong reason.
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
  HOME = mkdtempSync(join(tmpdir(), "wcli-rmliq-"));
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

const PAIR = [
  "--token0",
  "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
  "--token1",
  "TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a",
];

const V4_PAIR = [
  "--position-id",
  "12",
  "--token0",
  "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
  "--token1",
  "TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a",
];

describe("protocol", () => {
  it("names V4 among the protocols it serves", () => {
    const r = run([
      "sunswap",
      "remove-liquidity",
      "--protocol",
      "V5",
      ...PAIR,
      "--liquidity",
      "1",
      "--network",
      "nile",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
    expect(r.json.error.message).toBe("invalid --protocol: must be V2, V3 or V4");
  });
});

/**
 * V4's own flag matrix.
 *
 * All of it is decided at parse time, so none of these cases reaches a wallet or a node — which is
 * the point: a caller who named the wrong flags learns it without being asked for a password first.
 */
describe("the V4 flag matrix", () => {
  // The tokens always go to the signing account. A flag accepted and ignored would say otherwise.
  it("refuses --recipient", () => {
    const r = run([
      "sunswap",
      "remove-liquidity",
      "--protocol",
      "V4",
      ...V4_PAIR,
      "--liquidity",
      "1",
      "--recipient",
      "TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB",
      "--network",
      "nile",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
    expect(r.json.error.message).toContain("always settles to the signing account");
  });

  // The one scenario that needs BOTH: the pair is a cross-check against the position, not a
  // selector, so leaving it out is a missing option rather than something to infer.
  it("requires the pair alongside --position-id", () => {
    const r = run([
      "sunswap",
      "remove-liquidity",
      "--protocol",
      "V4",
      "--position-id",
      "12",
      "--liquidity",
      "1",
      "--network",
      "nile",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("missing_option");
    expect(r.json.error.message).toContain("--token0");
  });

  it("requires --position-id alongside the pair", () => {
    const r = run([
      "sunswap",
      "remove-liquidity",
      "--protocol",
      "V4",
      ...PAIR,
      "--liquidity",
      "1",
      "--network",
      "nile",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("missing_option");
  });

  /**
   * They COMBINE: `--slippage` is a tolerance applied to `--min0`/`--min1` "further down". An
   * earlier version refused the pair — which rejected the one shape a careful caller wants, a
   * floor they chose with a little room under it.
   *
   * Asserted through to the DRY RUN rather than only at the parser, so this cannot pass while the
   * service quietly discards one of them.
   */
  it("accepts --slippage together with --min0, and applies one under the other", () => {
    const r = run([
      "sunswap",
      "remove-liquidity",
      "--protocol",
      "V4",
      ...V4_PAIR,
      "--liquidity",
      "1",
      "--slippage",
      "0.005",
      "--min0",
      "1",
      "--dry-run",
      "--network",
      "nile",
      "-o",
      "json",
    ]);
    expect(r.json.error?.code).not.toBe("invalid_option");
  });

  it.each([
    ["--fee", "500"],
    ["--slippage", "0.005"],
  ])("refuses %s on V3, where it means nothing", (flag, value) => {
    const r = run([
      "sunswap",
      "remove-liquidity",
      "--protocol",
      "V3",
      "--position-id",
      "12",
      "--liquidity",
      "1",
      flag,
      value,
      "--network",
      "nile",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
    expect(r.json.error.message).toContain("is a V4 flag");
  });
});

describe("the flag matrix", () => {
  // A V2 pool has no positions, and a V3 position already names its pair. Accepting the other
  // scenario's flags would let a caller believe the two could disagree.
  it("refuses --position-id on V2", () => {
    const r = run([
      "sunswap",
      "remove-liquidity",
      "--protocol",
      "V2",
      ...PAIR,
      "--position-id",
      "1",
      "--liquidity",
      "1",
      "--network",
      "nile",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
    expect(r.json.error.message).toBe(
      "invalid --position-id: is not accepted on V2; a V2 pool has no positions",
    );
  });

  it.each([["--token0"], ["--token1"]])("refuses %s on V3", (flag) => {
    const r = run([
      "sunswap",
      "remove-liquidity",
      "--protocol",
      "V3",
      "--position-id",
      "1",
      flag,
      "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
      "--liquidity",
      "1",
      "--network",
      "nile",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
    expect(r.json.error.message).toContain("the position already names the pair");
  });

  it("requires --position-id on V3", () => {
    const r = run([
      "sunswap",
      "remove-liquidity",
      "--protocol",
      "V3",
      "--liquidity",
      "1",
      "--network",
      "nile",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("missing_option");
  });

  it.each([["--token0"], ["--token1"]])("requires %s on V2", (flag) => {
    const args = ["sunswap", "remove-liquidity", "--protocol", "V2", "--liquidity", "1"];
    if (flag === "--token1") args.push("--token0", "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf");
    const r = run([...args, "--network", "nile", "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("missing_option");
  });

  // Multi-transaction flows cannot guarantee offline what order their parts land in.
  it("does not offer --sign-only", () => {
    const r = run([
      "sunswap",
      "remove-liquidity",
      "--protocol",
      "V2",
      ...PAIR,
      "--liquidity",
      "1",
      "--sign-only",
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
      "remove-liquidity",
      "--protocol",
      "V2",
      ...PAIR,
      "--liquidity",
      "1",
      "--dry-run",
      "--network",
      "shasta",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("unsupported_network_capability");
    expect(r.json.error.message).toBe(
      "sunswap remove-liquidity is available on tron and nile only",
    );
  });
});

describe("help", () => {
  it("says that --liquidity means different things on V2 and on the position protocols", () => {
    const r = run(["sunswap", "remove-liquidity", "--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("--liquidity");
    // The one that is silent when got wrong.
    expect(r.stdout).toContain("LP tokens");
    expect(r.stdout).toContain("internal liquidity");
    expect(r.stdout).not.toContain("--sign-only");
  });

  // `--fee` is a cross-check on V4 and selects nothing. Help has to say so, because every other
  // command that has a --fee uses it to choose something.
  it("says --fee only checks the position's tier", () => {
    const r = run(["sunswap", "remove-liquidity", "--help"]);
    expect(r.stdout).toContain("--fee");
    expect(r.stdout).toContain("selects nothing");
  });
});
