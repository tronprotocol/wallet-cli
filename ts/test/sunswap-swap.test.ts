// Router preconditions use local RPC/API fixtures to avoid live prices and availability.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DETACHED } from "./detached.js";

const ENTRY_ARGS = process.env.WALLET_CLI_TEST_ENTRY
  ? [process.env.WALLET_CLI_TEST_ENTRY]
  : ["--import", "tsx", join(process.cwd(), "src", "index.ts")];

const TOKEN = "TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E";

const RPC_FIXTURE = fileURLToPath(new URL("./sunswap-swap-preload.mjs", import.meta.url));

let walletHome: string;
beforeEach(() => {
  walletHome = mkdtempSync(join(tmpdir(), "wcli-swap-"));
});
afterEach(() => {
  rmSync(walletHome, { recursive: true, force: true });
});

function run(args: string[]) {
  const env = { ...process.env, WALLET_CLI_HOME: walletHome } as Record<string, string>;
  delete env.MASTER_PASSWORD;
  const r = spawnSync(process.execPath, ["--import", RPC_FIXTURE, ...ENTRY_ARGS, ...args], {
    encoding: "utf8",
    env,
    timeout: 25_000,
    ...DETACHED,
  } as SpawnSyncOptionsWithStringEncoding);
  if (r.error || r.signal) {
    throw new Error(
      `CLI subprocess failed: ${r.error?.message ?? r.signal}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
    );
  }
  expect(r.stderr).not.toContain("Unexpected fixture request");
  let json: any;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* not JSON */
  }
  return { stdout: r.stdout, stderr: r.stderr, status: r.status, json };
}

describe("the flag matrix", () => {
  it.each([["--dry-run"], ["--build-only"]])("refuses %s alongside --quote", (flag) => {
    const r = run([
      "sunswap",
      "swap",
      "TRX",
      TOKEN,
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
  });

  it("refuses --slippage alongside --quote", () => {
    const r = run([
      "sunswap",
      "swap",
      "TRX",
      TOKEN,
      "1",
      "--quote",
      "--slippage",
      "0.01",
      "--network",
      "tron",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
    expect(r.json.error.message).toContain("enforces no floor");
  });

  it("refuses --all without --quote", () => {
    const r = run([
      "sunswap",
      "swap",
      "TRX",
      TOKEN,
      "1",
      "--all",
      "--network",
      "tron",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
    expect(r.json.error.message).toContain("only accepted with --quote");
  });

  it("refuses a token swapped for itself", () => {
    const r = run([
      "sunswap",
      "swap",
      "TRX",
      "TRX",
      "1",
      "--quote",
      "--network",
      "tron",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(1);
    expect(r.json.error.code).toBe("same_token");
  });

  it("requires all three positionals", () => {
    const r = run(["sunswap", "swap", "TRX", "--network", "tron", "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("missing_option");
  });
});

describe("network availability", () => {
  it.each([["nile"], ["shasta"]])("refuses %s and names where it does work", (network) => {
    const r = run([
      "sunswap",
      "swap",
      "TRX",
      TOKEN,
      "1",
      "--quote",
      "--network",
      network,
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("unsupported_network_capability");
    expect(r.json.error.message).toBe("sunswap swap is available on tron only");
  });

  it("refuses an EVM network on the family", () => {
    const r = run([
      "sunswap",
      "swap",
      "TRX",
      TOKEN,
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

describe("a router pair that spends a token", () => {
  it("refuses --build-only and says why, with no wallet configured", () => {
    const r = run([
      "sunswap",
      "swap",
      "USDT",
      "TRX",
      "1",
      "--build-only",
      "--network",
      "tron",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
    expect(r.json.error.message).toContain("embeds a Permit2 signature");
    expect(r.json.error.message).toContain("a swap that spends TRX has no permit and does build");
  });

  // The preload serves the market, token and route reads that precede account resolution.
  it.each([
    ["execute", []],
    ["dry-run", ["--dry-run"]],
  ])("asks for an account in %s", (_name, flags) => {
    const r = run([
      "sunswap",
      "swap",
      "USDT",
      "TRX",
      "1",
      ...flags,
      "--network",
      "tron",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(1);
    expect(r.json.error.code).toBe("missing_wallet_address");
  });

  it("does not refuse --build-only when the swap spends TRX", () => {
    const r = run([
      "sunswap",
      "swap",
      "TRX",
      "USDT",
      "1",
      "--build-only",
      "--network",
      "tron",
      "-o",
      "json",
    ]);
    expect(r.json.error.code).toBe("missing_wallet_address");
  });
});

describe("help", () => {
  it("leads with the market decision and names both defaults", () => {
    const r = run(["sunswap", "swap", "--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("--quote");
    expect(r.stdout).toContain("--all");
    expect(r.stdout).toContain("--slippage");
    expect(r.stdout).toContain("THE MARKET IS CHOSEN FIRST");
    expect(r.stdout).toContain("Permit2");
    expect(r.stdout).toContain("0.5%");
    expect(r.stdout).toContain("5%");
    expect(r.stdout).not.toContain("--sign-only");
  });
});
