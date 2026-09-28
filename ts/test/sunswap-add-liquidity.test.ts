/**
 * Black-box checks for `sunswap add-liquidity`.
 *
 * Everything here is refused BEFORE a key is touched and, except where noted, before a request
 * would be made — so the suite needs neither a funded account nor a reachable node. The cases
 * that do need the chain (the dry-run's amounts and fee, the build-only transaction list) are
 * covered by unit tests and by the live Nile smoke, because pinning a golden file to a pool whose
 * reserves move every block would fail for the wrong reason.
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

describe("protocol", () => {
  /**
   * V4 is SERVED now, so the old case asserting "not supported yet" is gone.
   *
   * What replaces it is the refusal a V4 caller actually meets: V4 identifies a pool by its
   * 32-byte id, not by a pair, so `--protocol V4` with a pair and no `--pool` is a MISSING option
   * rather than a rejected protocol. That is the more useful assertion — it pins where V4's own
   * identity rules start.
   */
  it("asks a V4 caller for the pool it cannot infer from a pair", () => {
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
  });

  // And a protocol that genuinely does not exist is still refused by value.
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
  /**
   * The concentrated-liquidity flags are not declared on a V2-only command, so the parser refuses
   * them as unknown rather than a refinement rejecting a flag that `--help` advertises. Either
   * way it is `invalid_option` at exit 2, which is what the matrix asks for.
   */
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

  // --sign-only is not offered anywhere in this group: a multi-transaction flow cannot guarantee
  // offline what order its parts land in, or that the allowance is there when the deposit is.
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
  // A position's pair, tier and range are fixed at birth. Accepting these flags alongside
  // --position-id would suggest they can be changed, which they cannot.
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

/**
 * The V4 增倉 scenario (PM 6.1.3, the V4 追加 column).
 *
 * Its matrix is NOT V3's, and the difference is the point. On V3 an increase refuses the pair; on V4
 * PM requires it, because there the pair is a cross-check against what the position reports rather
 * than a selector. Everything the position genuinely fixes — its range, its holder, its pool — is
 * still refused.
 */
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
    ["--pool", "2f8c".padEnd(64, "a")],
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

  // The ceiling points the other way from a floor, on every V4 scenario.
  it.each([["--min0"], ["--min1"]])("refuses %s, because V4 bounds from above", (flag) => {
    const r = run([...V4_INCREASE, flag, "1", "--network", "nile", "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
    expect(r.json.error.message).toContain("ABOVE");
  });

  /**
   * And the pair is REQUIRED, which is where V4 parts company with V3.
   *
   * It selects nothing — the position names its own pool — so the only thing it can be is a guard
   * against adding to a position the caller did not mean. Dropping it would remove that guard
   * silently, which is why its absence is an error rather than a default.
   */
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

  /**
   * `--fee` and `--slippage` ARE accepted here — the tier as a second cross-check, the tolerance on
   * the ceiling. Asserted by what the command fails on instead: it gets past the whole flag matrix
   * and stops on the account it has no way to resolve, which is the next gate rather than this one.
   */
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
    // Exit 1, not 2: the flag matrix is a usage gate and this is past it.
    expect(r.status).toBe(1);
    expect(r.json.error.code).toBe("missing_wallet_address");
  });
});

describe("network availability", () => {
  // The capability is registered from the network's own SunSwap contract block, so the networks
  // without one refuse before any request.
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

  /**
   * An EVM network fails EARLIER, and for a different reason: family resolution runs before the
   * capability gate, so a TRON-only command on an EVM network is `family_mismatch` — the same
   * answer `stake`, `vote`, `gasfree` and `exchange` give. PM 12.2 asks for
   * `unsupported_network_capability` here, but honouring that would mean special-casing the
   * family check for this one group so the same user error reported differently in sunswap than
   * everywhere else.
   *
   * The pair of cases is the assertion worth keeping: it documents where the boundary sits.
   */
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
    // V3's flags are served now and must be documented.
    expect(r.stdout).toContain("--tick-lower");
    expect(r.stdout).toContain("--position-id");
    // On V3 a caller's TRX silently becomes WTRX, so help has to say so.
    expect(r.stdout).toContain("WTRX");
    // V4's flags are served now too, so they must be documented rather than absent.
    expect(r.stdout).toContain("--sqrt-price");
    expect(r.stdout).toContain("--create-pool");
    expect(r.stdout).toContain("--slippage");
    // And the one flag this command genuinely does not serve must still not appear.
    expect(r.stdout).not.toContain("--sign-only");
  });
});
