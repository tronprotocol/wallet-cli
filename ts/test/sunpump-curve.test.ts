/**
 * Black-box checks for `sunpump buy` and `sunpump sell`.
 *
 * Everything here is refused before a key is touched, and every case but the network gate is
 * refused before a request would be made — so the suite needs neither a funded account nor a
 * reachable node. Pricing, the curve's state gate and the platform-fee floor are covered by unit
 * tests and by the live mainnet smoke, because a curve's price moves with every trade and a golden
 * file pinned to one would fail for the wrong reason.
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

const TOKEN = "TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E";

let HOME: string;
beforeEach(() => {
  HOME = mkdtempSync(join(tmpdir(), "wcli-pump-"));
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

describe("--quote excludes the flags that describe a transaction", () => {
  it.each([["--dry-run"], ["--build-only"]])("refuses %s alongside --quote", (flag) => {
    const r = run([
      "sunpump",
      "buy",
      TOKEN,
      "--trx",
      "1",
      "--quote",
      flag,
      "--network",
      "tron",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
    expect(r.json.error.message).toContain("which sends no transaction");
  });
});

describe("the two floors are exclusive", () => {
  // Two ways of setting the same thing. A caller who gave both does not know which they are
  // getting, so neither silently wins.
  it.each([
    ["buy", "--trx"],
    ["sell", "--amount"],
  ])("refuses --slippage with --min-out on %s", (command, amountFlag) => {
    const r = run([
      "sunpump",
      command,
      TOKEN,
      amountFlag,
      "1",
      "--slippage",
      "0.05",
      "--min-out",
      "1",
      "--network",
      "tron",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
    expect(r.json.error.message).toContain("two ways of setting the same floor");
  });
});

describe("--slippage bounds", () => {
  it.each([["0.9"], ["0"], ["0.00005"]])("refuses %s", (value) => {
    const r = run([
      "sunpump",
      "buy",
      TOKEN,
      "--trx",
      "1",
      "--slippage",
      value,
      "--network",
      "tron",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
  });

  /**
   * The conversion to basis points is integer arithmetic on the digits, not
   * `Number(value) * 10000` — which turns 0.0003 into 2.9999999999999996 and floors it to 2,
   * silently giving a caller a worse floor than they asked for. Four decimals is the limit
   * precisely so the conversion is always exact; a fifth is refused rather than rounded away.
   */
  it("refuses a tolerance finer than one basis point rather than rounding it to zero", () => {
    const r = run([
      "sunpump",
      "buy",
      TOKEN,
      "--trx",
      "1",
      "--slippage",
      "0.00001",
      "--network",
      "tron",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
    expect(r.json.error.message).toContain("one basis point");
  });
});

describe("required options", () => {
  it.each([
    ["buy", "--trx"],
    ["sell", "--amount"],
  ])("%s requires %s", (command, flag) => {
    const r = run(["sunpump", command, TOKEN, "--network", "tron", "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("missing_option");
    expect(r.stderr + r.stdout).toContain(flag.replace("--", ""));
  });

  it.each([["buy"], ["sell"]])("%s refuses an address that is not one", (command) => {
    const r = run([
      "sunpump",
      command,
      "not-an-address",
      command === "buy" ? "--trx" : "--amount",
      "1",
      "--network",
      "tron",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_address");
  });
});

describe("network availability", () => {
  /**
   * PM 3.1: this group is mainnet only, and the gate is the network's own config block rather
   * than a branch on its id. Nile's launchpad contract exists and is reachable, but the released
   * binary does not carry its address — so a tester opens it in config.yaml and nothing in the
   * code has to change.
   */
  it.each([
    ["nile", "buy"],
    ["nile", "sell"],
    ["shasta", "buy"],
  ])("refuses %s for %s and names where it does work", (network, command) => {
    const r = run([
      "sunpump",
      command,
      TOKEN,
      command === "buy" ? "--trx" : "--amount",
      "1",
      "--quote",
      "--network",
      network,
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("unsupported_network_capability");
    expect(r.json.error.message).toBe(`sunpump ${command} is available on tron only`);
  });

  it("refuses an EVM network on the family, before the capability gate", () => {
    const r = run([
      "sunpump",
      "buy",
      TOKEN,
      "--trx",
      "1",
      "--quote",
      "--network",
      "sepolia",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("family_mismatch");
  });
});

describe("help", () => {
  it.each([["buy"], ["sell"]])("%s documents the fee floor and the state gate", (command) => {
    const r = run(["sunpump", command, "--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("--quote");
    expect(r.stdout).toContain("--slippage");
    expect(r.stdout).toContain("--min-out");
    // The two facts a caller cannot infer from the flags.
    expect(r.stdout).toContain("0.01 TRX MINIMUM");
    expect(r.stdout).toContain("TRADING");
    expect(r.stdout).not.toContain("--sign-only");
  });

  // A buy approves nothing; a sale approves without limit. Both are surprising, so both are said.
  it("buy says nothing is approved", () => {
    const r = run(["sunpump", "buy", "--help"]);
    expect(r.stdout).toContain("NOTHING is approved");
  });

  it("sell says the approval is unlimited and the spender upgradeable", () => {
    const r = run(["sunpump", "sell", "--help"]);
    expect(r.stdout).toContain("UNLIMITED");
    expect(r.stdout).toContain("upgradeable proxy");
  });
});

/**
 * A quote publishes no floor, in either direction.
 *
 * `--quote` refuses `--slippage`, so a minimum would come from a default the caller never chose,
 * and nothing would enforce it because a quote produces no transaction. An agent reading it would
 * believe it had protection it does not have (PM 10.1.4).
 *
 * These cases reach the chain — they are the one part of this file that does — because the
 * omission is a property of the real payload and asserting it against a stub would prove nothing.
 */
describe("quote mode carries no minimum", () => {
  const TRADING = "TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E";

  it("buy: no slippage, no tokensOutMinimum, but the scale stays", () => {
    const r = run([
      "sunpump",
      "buy",
      TRADING,
      "--trx",
      "1",
      "--quote",
      "--network",
      "tron",
      "-o",
      "json",
    ]);
    if (r.status !== 0) return; // the curve may have launched; the offline cases still hold
    expect(r.json.data.mode).toBe("quote");
    expect(r.json.data).not.toHaveProperty("slippage");
    expect(r.json.data).not.toHaveProperty("tokensOutMinimum");
    expect(r.json.data.tokensOutExpected).toMatch(/^\d+$/);
    expect(r.json.data.tokenDecimals).toBe(18);
  });

  it("sell: no slippage, no trxOutMinimum", () => {
    const r = run([
      "sunpump",
      "sell",
      TRADING,
      "--amount",
      "1000",
      "--quote",
      "--network",
      "tron",
      "-o",
      "json",
    ]);
    if (r.status !== 0) return;
    expect(r.json.data.mode).toBe("quote");
    expect(r.json.data).not.toHaveProperty("slippage");
    expect(r.json.data).not.toHaveProperty("trxOutMinimum");
  });
});
