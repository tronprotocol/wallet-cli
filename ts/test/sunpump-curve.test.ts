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
    /* not JSON */
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

  it.each([
    ["buy", "--trx", "--slippage", "0.0001", "a tolerance"],
    ["sell", "--amount", "--min-out", "1", "a minimum"],
  ])("%s refuses %s with %s alongside --quote", (command, amountFlag, flag, value, what) => {
    const r = run([
      "sunpump",
      command,
      TOKEN,
      amountFlag,
      "1",
      "--quote",
      flag,
      value,
      "--network",
      "tron",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
    expect(r.json.error.message).toBe(
      `invalid ${flag}: cannot be given with --quote: a quote enforces no floor, so ${what} would have nothing to apply to`,
    );
  });

  it("refuses --wait alongside --quote", () => {
    const r = run([
      "sunpump",
      "sell",
      TOKEN,
      "--amount",
      "1",
      "--quote",
      "--wait",
      "--network",
      "tron",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
    expect(r.json.error.message).toBe(
      "--wait cannot be used with --quote, which submits no transaction",
    );
  });

  it("rejects the removed --wait-timeout as an unknown option", () => {
    const r = run([
      "sunpump",
      "sell",
      TOKEN,
      "--amount",
      "1",
      "--quote",
      "--wait-timeout",
      "1000",
      "--network",
      "tron",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
    expect(r.json.error.message).toBe("unknown option(s): --wait-timeout");
  });
});

describe("the two floors are exclusive", () => {
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
    expect(r.stdout).toContain("0.01 TRX MINIMUM");
    expect(r.stdout).toContain("TRADING");
    expect(r.stdout).not.toContain("--sign-only");
  });

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

// These quote cases read live state and may return before assertions.
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
    if (r.status !== 0) return;
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
