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
  HOME = mkdtempSync(join(tmpdir(), "wcli-addliq-"));
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

describe("protocol", () => {
  it("asks a V4 caller for the parts of the pool key a pair does not carry", () => {
    const r = run([
      "sunswap",
      "add-liquidity",
      "--protocol",
      "V4",
      ...PAIR,
      "--amount0",
      "1",
      "--network",
      "nile",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.success).toBe(false);
    expect(r.json.error.code).toBe("missing_option");
    expect(r.json.error.message).toContain("--fee");
  });

  it("asks for --tick-spacing once the tier is given, and says a tier does not fix it", () => {
    const r = run([
      "sunswap",
      "add-liquidity",
      "--protocol",
      "V4",
      ...PAIR,
      "--fee",
      "500",
      "--amount0",
      "1",
      "--network",
      "nile",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("missing_option");
    expect(r.json.error.message).toContain("--tick-spacing");
    expect(r.json.error.message).toContain("SAME fee tier");
  });

  it("no longer accepts --pool", () => {
    const r = run([
      "sunswap",
      "add-liquidity",
      "--protocol",
      "V4",
      ...PAIR,
      "--pool",
      "2f8c".padEnd(64, "a"),
      "--fee",
      "500",
      "--tick-spacing",
      "10",
      "--amount0",
      "1",
      "--network",
      "nile",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
  });

  it("still refuses a protocol that does not exist", () => {
    const r = run([
      "sunswap",
      "add-liquidity",
      "--protocol",
      "V5",
      ...PAIR,
      "--amount0",
      "1",
      "--network",
      "nile",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
  });
});

describe("the flag matrix", () => {
  it.each([
    ["--fee", "3000"],
    ["--tick-lower", "-887220"],
    ["--tick-upper", "887220"],
    ["--position-id", "1846"],
    ["--slippage", "0.01"],
    ["--sqrt-price", "79228162514264337593543950336"],
  ])("refuses %s on V2, where there is no range to describe", (flag, value) => {
    const r = run([
      "sunswap",
      "add-liquidity",
      "--protocol",
      "V2",
      ...PAIR,
      "--amount0",
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
    expect(r.json.error.message).toContain(flag);
  });

  it("does not offer --sign-only", () => {
    const r = run([
      "sunswap",
      "add-liquidity",
      "--protocol",
      "V2",
      ...PAIR,
      "--amount0",
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

describe("the V3 increase scenario", () => {
  it.each([
    ["--token0", "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"],
    ["--token1", "TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a"],
    ["--fee", "500"],
    ["--tick-lower", "-8030"],
    ["--tick-upper", "-6030"],
    ["--recipient", "TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB"],
  ])("refuses %s alongside --position-id", (flag, value) => {
    const r = run([
      "sunswap",
      "add-liquidity",
      "--protocol",
      "V3",
      "--position-id",
      "686",
      "--amount0",
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
    expect(r.json.error.message).toContain("the position already fixes it");
  });
});

describe("the V4 increase scenario", () => {
  const V4_INCREASE = [
    "sunswap",
    "add-liquidity",
    "--protocol",
    "V4",
    "--position-id",
    "12",
    ...PAIR,
    "--amount0",
    "1",
  ];

  it.each([
    ["--tick-lower", "-1284"],
    ["--tick-upper", "1116"],
    ["--recipient", "TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB"],
    ["--sqrt-price", "79228162514264337593543950336"],
    ["--tick-spacing", "12"],
    ["--hooks", "TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB"],
  ])("refuses %s alongside --position-id", (flag, value) => {
    const r = run([...V4_INCREASE, flag, value, "--network", "nile", "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
    expect(r.json.error.message).toContain(flag);
  });

  it("refuses --create-pool alongside --position-id", () => {
    const r = run([...V4_INCREASE, "--create-pool", "--network", "nile", "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
  });

  it.each([["--min0"], ["--min1"]])("refuses %s, because V4 bounds from above", (flag) => {
    const r = run([...V4_INCREASE, flag, "1", "--network", "nile", "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
    expect(r.json.error.message).toContain("ABOVE");
  });

  it.each([["--token0"], ["--token1"]])("requires %s", (missing) => {
    const kept = missing === "--token0" ? ["--token1", PAIR[3]!] : ["--token0", PAIR[1]!];
    const r = run([
      "sunswap",
      "add-liquidity",
      "--protocol",
      "V4",
      "--position-id",
      "12",
      ...kept,
      "--amount0",
      "1",
      "--network",
      "nile",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("missing_option");
    expect(r.json.error.message).toContain("checked against the pair the position holds");
  });

  it("accepts --fee and --slippage, and stops on the account instead", () => {
    const r = run([
      ...V4_INCREASE,
      "--fee",
      "500",
      "--slippage",
      "0.01",
      "--dry-run",
      "--network",
      "nile",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(1);
    expect(r.json.error.code).toBe("missing_wallet_address");
  });
});

describe("network availability", () => {
  it("refuses shasta and names where the command does work", () => {
    const r = run([
      "sunswap",
      "add-liquidity",
      "--protocol",
      "V2",
      ...PAIR,
      "--amount0",
      "1",
      "--dry-run",
      "--network",
      "shasta",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("unsupported_network_capability");
    expect(r.json.error.message).toBe("sunswap add-liquidity is available on tron and nile only");
  });

  it("refuses an EVM network earlier still, on the family", () => {
    const r = run([
      "sunswap",
      "add-liquidity",
      "--protocol",
      "V2",
      ...PAIR,
      "--amount0",
      "1",
      "--dry-run",
      "--network",
      "sepolia",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("family_mismatch");
    expect(r.json.error.message).toBe(
      "command sunswap add-liquidity supports tron but selected network eip155:11155111 is evm",
    );
  });
});

describe("help", () => {
  it("documents the deposit, the approval sequence, and that --dry-run needs no password", () => {
    const r = run(["sunswap", "add-liquidity", "--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("--protocol");
    expect(r.stdout).toContain("--min0");
    expect(r.stdout).toContain("--deadline");
    expect(r.stdout).toContain("--tick-lower");
    expect(r.stdout).toContain("--position-id");
    expect(r.stdout).toContain("WTRX");
    expect(r.stdout).toContain("--sqrt-price");
    expect(r.stdout).toContain("--create-pool");
    expect(r.stdout).toContain("--slippage");
    expect(r.stdout).toContain("--tick-spacing");
    expect(r.stdout).toContain("--hooks");
    expect(r.stdout).toMatch(/tick spacing/i);
    expect(r.stdout).not.toMatch(/(^|[\s,[(])--pool([\s,\].)=]|$)/m);
    expect(r.stdout).not.toContain("--sign-only");
  });
});
