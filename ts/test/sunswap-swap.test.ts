/**
 * Black-box checks for `sunswap swap`.
 *
 * The flag matrix and the network gate are refused before a request would be made. The market
 * decision and the pricing are covered by unit tests and by the live mainnet smoke, because both
 * markets' prices move with every trade — a curve's with every buy, the router's with every
 * block.
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
  HOME = mkdtempSync(join(tmpdir(), "wcli-swap-"));
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

  /**
   * A tolerance only means something when a floor will be enforced, and a quote enforces none —
   * so accepting `--slippage` here would let a caller believe the number they typed did
   * something.
   */
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
  /**
   * `swap` has its OWN capability key rather than sharing SunPump's: this release serves only the
   * curve branch, so it is available where a curve is — but it must not be switched on merely
   * because SunPump is configured once the router branch lands.
   */
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
  /**
   * `--build-only` cannot be served: the transaction embeds a Permit2 signature, so it does not
   * exist until one does. The refusal lands BEFORE the account requirement, which is why this case
   * passes with an empty wallet home — it does not depend on who is trading, so a caller should get
   * the reason rather than be asked for an account first.
   */
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

  /**
   * Every other sending mode needs an account — and REACHES THE NETWORK FIRST.
   *
   * The command declares `wallet: "none"` so that `--quote` works with no wallet at all, which means
   * the use case resolves the account itself. It cannot do that until it knows which market the pair
   * is on, and that is an on-chain read. So a caller with no account gets a launchpad read before the
   * refusal. The ordering is deliberate — the market decision is made once, before anything else, so
   * a quote and a fill cannot land on different markets — and the cost is one read on a path that was
   * going to fail. Recorded here because the previous version of this comment claimed the opposite.
   */
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
    // Exit 1, not 2: a missing account is a runtime failure, not a malformed request. The same
    // command works unchanged once an account exists.
    expect(r.status).toBe(1);
    expect(r.json.error.code).toBe("missing_wallet_address");
  });

  /**
   * A swap that spends TRX carries no permit, so `--build-only` is NOT refused for it — it gets as
   * far as needing an account. The pair of cases is the interesting assertion: it documents that the
   * refusal is about the permit rather than about the command.
   */
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
    // The two facts a caller cannot infer: how the market is chosen, and that the default differs
    // from the sunpump commands reaching the same curve.
    expect(r.stdout).toContain("THE MARKET IS CHOSEN FIRST");
    // The two grants a token swap makes, and that neither is unlimited, belong in help rather than
    // only in the docs: it is the part a caller is consenting to.
    expect(r.stdout).toContain("Permit2");
    expect(r.stdout).toContain("0.5%");
    expect(r.stdout).toContain("5%");
    expect(r.stdout).not.toContain("--sign-only");
  });
});
