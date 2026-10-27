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
    /* not JSON */
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

describe("the V4 flag matrix", () => {
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

  // This checks flag acceptance, not the calculated withdrawal minimum.
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
    expect(r.stdout).toContain("LP tokens");
    expect(r.stdout).toContain("internal liquidity");
    expect(r.stdout).not.toContain("--sign-only");
  });

  it("says --fee only checks the position's tier", () => {
    const r = run(["sunswap", "remove-liquidity", "--help"]);
    expect(r.stdout).toContain("--fee");
    expect(r.stdout).toContain("selects nothing");
  });
});
