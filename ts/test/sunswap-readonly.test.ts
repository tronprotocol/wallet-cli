/**
 * Black-box checks for the SunSwap read-only commands.
 *
 * Everything here runs against an EMPTY WALLET_CLI_HOME and passes no password: these commands
 * take no account, so a wallet must never be a precondition for one. Nothing here reaches the
 * network — every case is refused before a request would be made.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DETACHED } from "./detached.js";

const ENTRY_ARGS = process.env.WALLET_CLI_TEST_ENTRY
  ? [process.env.WALLET_CLI_TEST_ENTRY]
  : ["--import", "tsx", join(process.cwd(), "src", "index.ts")];

let HOME: string;
beforeEach(() => {
  HOME = mkdtempSync(join(tmpdir(), "wcli-sunswap-"));
});

/** no wallet, no password, no stdin — the way an agent would call a read-only query. */
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

describe("network availability", () => {
  // The switch is the network's config block, not a branch on its id: Nile has no market API, so
  // the capability is never registered there.
  it.each(["nile", "shasta"])("refuses %s and names where the command does work", (network) => {
    const r = run(["sunswap", "price", "TRX", "--network", network, "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.success).toBe(false);
    expect(r.json.error.code).toBe("unsupported_network_capability");
    expect(r.json.error.message).toBe("sunswap price is available on tron only");
  });

  it.each([["token-list"], ["token-search"], ["pool-list"], ["pool-search"], ["position-list"]])(
    "gates %s the same way",
    (command) => {
      const args = command.endsWith("-search")
        ? ["sunswap", command, "USDT", "--network", "nile", "-o", "json"]
        : ["sunswap", command, "--network", "nile", "-o", "json"];
      const r = run(args);
      expect(r.status).toBe(2);
      expect(r.json.error.code).toBe("unsupported_network_capability");
      expect(r.json.error.message).toBe(`sunswap ${command} is available on tron only`);
    },
  );

  /**
   * An EVM network fails on the FAMILY, before the capability gate — which is where a TRON-only
   * command fails everywhere in this CLI, not just here. The hedge this assertion used to carry
   * (`toContain([capability, family])`) passed whichever the binary did, so it could not fail and
   * documented nothing.
   */
  it("refuses an EVM network earlier still, on the family", () => {
    const r = run(["sunswap", "price", "TRX", "--network", "sepolia", "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("family_mismatch");
    expect(r.json.error.message).toBe(
      "command sunswap price supports tron but selected network eip155:11155111 is evm",
    );
  });

  // The whole point of keying on config: a tester opens a network by editing config.yaml, with
  // no code change and no rebuild.
  it("is enabled on Nile by config alone", () => {
    writeFileSync(
      join(HOME, "config.yaml"),
      "networks:\n  nile:\n    sunswap:\n      marketApiBaseUrl: http://127.0.0.1:9\n",
    );
    const r = run(["sunswap", "price", "TRX", "--network", "nile", "-o", "json"]);
    // it now gets past the gate and fails at the (unreachable) endpoint instead
    expect(r.json.error.code).not.toBe("unsupported_network_capability");
  });
});

describe("usage errors", () => {
  it("requires one of the token argument or --address", () => {
    const r = run(["sunswap", "price", "--network", "tron", "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("missing_option");
  });

  it("refuses both the token argument and --address", () => {
    const r = run([
      "sunswap",
      "price",
      "TRX",
      "--address",
      "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      "--network",
      "tron",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
  });

  it("rejects a malformed address before asking anyone", () => {
    const r = run(["sunswap", "price", "--address", "0xdead", "--network", "tron", "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_address");
  });

  // The refusal must not send the reader somewhere that will not help: the user layer of the
  // token book is per-account and this command takes no account.
  it("refuses an unknown symbol without suggesting token add", () => {
    const r = run(["sunswap", "price", "WIN", "--network", "tron", "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("unsupported_token");
    expect(r.json.error.message).toContain("--address");
    expect(r.json.error.message).not.toContain("token add");
  });
});

describe("listing usage errors", () => {
  // The service answers an unknown scope or sort field with an empty or unsorted list rather
  // than an error, so a typo would read as a real answer. Each is refused locally instead.
  it.each([
    [["--protocol", "v9"], "invalid_value", /ALL, V1, V1_5, V2, V3, V4, CURVE/],
    [["--order-by", "apr"], "invalid_value", /tvl, volume-24h/],
    [["--limit", "0"], "invalid_value", /--limit/],
    [["--offset", "-1"], "invalid_value", /--offset/],
    [["--offset", "5", "--limit", "4"], "invalid_value", /multiple of --limit/],
    [["--offset", "1000"], "invalid_value", /only the first 1000 rows of each ordering/],
    [["--address", "0xdead"], "invalid_address", /0xdead/],
  ])("token-list %s", (args, code, message) => {
    const r = run([
      "sunswap",
      "token-list",
      ...(args as string[]),
      "--network",
      "tron",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe(code);
    expect(r.json.error.message).toMatch(message as RegExp);
  });

  // An empty keyword reaches the service as "no filter" and returns the whole catalogue.
  it("token-search refuses an empty keyword", () => {
    const r = run(["sunswap", "token-search", "", "--network", "tron", "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
  });

  it("token-search requires a keyword at all", () => {
    const r = run(["sunswap", "token-search", "--network", "tron", "-o", "json"]);
    expect(r.status).toBe(2);
  });

  // token-list has no --sort: the token endpoints expose a sort field but no direction, and a
  // flag the service ignores would be a promise the output does not keep.
  it("offers no --sort and no --include-blacklisted", () => {
    for (const args of [["--sort", "asc"], ["--include-blacklisted"]]) {
      const r = run(["sunswap", "token-list", ...args, "--network", "tron", "-o", "json"]);
      expect(r.status).toBe(2);
      expect(r.json.error.code).toBe("invalid_option");
    }
  });
});

describe("pool listing usage errors", () => {
  it.each([
    // no ALL here: on a listing that filters rows there is no protocol called ALL to belong to
    [["--protocol", "v9"], "invalid_value", /must be one of V1, V1_5, V2, V3, V4, CURVE/],
    [["--order-by", "nope"], "invalid_value", /tvl, volume-24h, fees-24h, apr/],
    [["--sort", "sideways"], "invalid_value", /--sort must be one of asc, desc/],
    [["--offset", "5", "--limit", "4"], "invalid_value", /multiple of --limit/],
    [["--offset", "1000"], "invalid_value", /only the first 1000 rows of each ordering/],
    [["--min-tvl", "1e5"], "invalid_value", /--min-tvl must be a non-negative decimal/],
    [["--token", "NOSUCHSYMBOL"], "unsupported_token", /with --token/],
  ])("pool-list %s", (args, code, message) => {
    const r = run([
      "sunswap",
      "pool-list",
      ...(args as string[]),
      "--network",
      "tron",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe(code);
    expect(r.json.error.message).toMatch(message as RegExp);
  });

  /**
   * The service refuses poolAddress and tokenAddress together. Passed through, that arrives as
   * provider_error — exit 1, retry "same" — telling a caller that retrying the identical command
   * might work when it never can, and blaming the service for a command-line mistake.
   */
  it("refuses --pool and --token together as a usage error, not a provider one", () => {
    const r = run([
      "sunswap",
      "pool-list",
      "--pool",
      "TSUUVjysXV8YqHytSNjfkNXnnB49QDvZpx",
      "--token",
      "USDT",
      "--network",
      "tron",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
    expect(r.json.error.message).toContain("--token");
  });

  it("documents the two filters as mutually exclusive in help", () => {
    const out = run(["sunswap", "pool-list", "--help"]).stdout;
    expect(out).toMatch(/At most one of these/);
  });

  it("pool-search refuses an empty keyword", () => {
    const r = run(["sunswap", "pool-search", "  ", "--network", "tron", "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
  });

  // pool-list KEEPS --sort because its endpoint takes a direction; the token endpoints do not.
  it("offers --sort on pool-list but not on token-list", () => {
    expect(run(["sunswap", "pool-list", "--help"]).stdout).toContain("--sort");
    expect(run(["sunswap", "token-list", "--help"]).stdout).not.toContain("--sort");
  });

  // Pool records carry no blacklist marker, so blacklisted pools could not be labelled.
  it("offers no --include-blacklisted", () => {
    const r = run([
      "sunswap",
      "pool-list",
      "--include-blacklisted",
      "--network",
      "tron",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
  });

  // The help must say that --min-tvl filters first and that apr needs it.
  it("documents --min-tvl and the apr advice in help", () => {
    const out = run(["sunswap", "pool-list", "--help"]).stdout;
    expect(out).toContain("applied before --limit/--offset");
    expect(out).toContain("When ordering by apr, set --min-tvl");
    expect(out).toContain("wallet-cli sunswap pool-list --order-by apr --min-tvl 100000");
  });

  // A V4 pool id is not a contract address, and a caller who treats it as one gets a failure
  // with no explanation unless the help says so.
  it("warns in help that a V4 pool id is not a contract", () => {
    const out = run(["sunswap", "pool-list", "--help"]).stdout;
    expect(out).toContain("64-hex pool id");
    expect(out).toMatch(/not a contract|share one pool manager/);
  });
});

describe("position-list usage errors", () => {
  // Address-scoped like `account balance`: the active account by default, `--account` for any
  // other. With no wallet and no `--account` there is nothing to list.
  it("needs an account when none is active", () => {
    const r = run(["sunswap", "position-list", "--network", "tron", "-o", "json"]);
    // exit 1, as `account balance` answers the same situation.
    expect(r.status).toBe(1);
    expect(r.json.error.code).toBe("missing_wallet_address");
  });

  it("refuses an --account that is neither a known account nor a TRON address", () => {
    const r = run([
      "sunswap",
      "position-list",
      "--account",
      "0xdead",
      "--network",
      "tron",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("account_not_found");
  });

  it("no longer takes --owner", () => {
    const r = run([
      "sunswap",
      "position-list",
      "--owner",
      "TT2T17KZhoDu47i2E4FWxfG79zdkEWkU9N",
      "--network",
      "tron",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
  });

  it("has no ordering flag, because the service sorts by value and takes none", () => {
    const out = run(["sunswap", "position-list", "--help"]).stdout;
    expect(out).not.toContain("--order-by");
    expect(out).not.toContain("--sort");
  });

  // A script that reads the Status column would miss a drained position; help says which field
  // to read instead.
  it("documents that EMPTY is a rendering, not a status value", () => {
    const out = run(["sunswap", "position-list", "--help"]).stdout;
    expect(out).toContain("extra.positionLiquidity");
  });
});

/**
 * The documented enum and the accepted enum must be the same enum.
 *
 * `--json-schema` is how an agent learns what is valid, so a value the schema does not list but
 * the binary accepts is one that settles into a generated script and breaks the day the gap is
 * closed. It was behaviourally harmless — on these three, ALL and omitting the flag return the
 * same rows — which is exactly why it would have survived unnoticed.
 */
describe("protocol scope versus protocol filter", () => {
  const invoke = (command: string, protocol: string) => {
    const extra =
      command === "pool-search"
        ? ["USDT"]
        : command === "position-list"
          ? ["--account", "TT2T17KZhoDu47i2E4FWxfG79zdkEWkU9N"]
          : [];
    return run([
      "sunswap",
      command,
      ...extra,
      "--protocol",
      protocol,
      "--limit",
      "1",
      "--network",
      "tron",
      "-o",
      "json",
    ]);
  };

  // A pool or a position belongs to one protocol; "all of them" is spelled by omitting the flag.
  it.each(["pool-list", "pool-search", "position-list"])("%s refuses ALL", (command) => {
    const r = invoke(command, "ALL");
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
    expect(r.json.error.message).toBe("--protocol must be one of V1, V1_5, V2, V3, V4, CURVE");
  });

  it.each(["pool-list", "pool-search", "position-list"])(
    "%s documents exactly what it accepts",
    (command) => {
      const out = run(["sunswap", command, "--help"]).stdout;
      expect(out).toContain("filter by protocol: V1, V1_5, V2, V3, V4, CURVE");
      expect(out).not.toMatch(/filter by protocol:[^\n]*ALL/);
    },
  );

  // On the token listings ALL is a real scope and the default: it changes what the numbers are,
  // not which rows appear.
  it.each(["token-list", "token-search"])("%s keeps ALL as a scope", (command) => {
    const out = run(["sunswap", command, "--help"]).stdout;
    expect(out).toContain("protocol scope: ALL, V1, V1_5, V2, V3, V4, CURVE");
  });
});

describe("discovery", () => {
  it("documents the command in help", () => {
    const r = run(["sunswap", "price", "--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("wallet-cli sunswap price");
    expect(r.stdout).toContain("--address");
  });

  it("lists sunswap under the root command groups", () => {
    const r = run(["--help"]);
    expect(r.stdout).toContain("sunswap");
  });

  it("publishes a schema for the command", () => {
    const r = run(["sunswap", "price", "--json-schema"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("address");
  });

  it("lists every shipped sunswap command in the group help", () => {
    const r = run(["sunswap", "--help"]);
    expect(r.status).toBe(0);
    for (const command of [
      "position-list",
      "pool-list",
      "pool-search",
      "token-list",
      "token-search",
      "price",
    ]) {
      expect(r.stdout).toContain(command);
    }
  });

  it("documents the listing flags without the ones the service cannot honour", () => {
    const r = run(["sunswap", "token-list", "--help"]);
    expect(r.stdout).toContain("--protocol");
    expect(r.stdout).toContain("--order-by");
    expect(r.stdout).toContain("--limit");
    expect(r.stdout).not.toContain("--sort");
    expect(r.stdout).not.toContain("--include-blacklisted");
  });
});

/**
 * The symbol column is decoration; the prices are the answer.
 *
 * A stub market API answers the price call and fails the catalogue call, which is the one
 * arrangement that proves the degraded path end to end: the command still exits 0, the prices
 * are still there, and the notice lands in `meta.warnings` — the one place a caller reads it.
 * Asserting it off the ENVELOPE rather than a return value is the point: publishing it in the
 * wrong place is exactly the failure this guards, and that failure shipped once already.
 *
 * The stub runs out of process because `run` uses spawnSync, which blocks this process's event
 * loop — a server listening here would never get to accept the connection.
 */
describe("degraded symbol lookup", () => {
  let stub: ChildProcess;
  let base = "";

  beforeEach(async () => {
    stub = spawn(process.execPath, [join(process.cwd(), "test", "sunswap-market-stub.mjs")], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    const port = await new Promise<string>((resolve, reject) => {
      stub.stdout?.once("data", (chunk: Buffer) => resolve(chunk.toString().trim()));
      stub.once("error", reject);
    });
    base = `http://127.0.0.1:${port}`;
    writeFileSync(
      join(HOME, "config.yaml"),
      `networks:\n  nile:\n    sunswap:\n      marketApiBaseUrl: ${base}\n`,
    );
  });

  afterEach(() => {
    stub.kill();
  });

  it("still returns the prices, exits 0, and warns in meta", () => {
    const r = run(["sunswap", "price", "TRX", "--network", "nile", "-o", "json"]);
    expect(r.status).toBe(0);
    expect(r.json.success).toBe(true);
    expect(r.json.data.prices).toEqual([
      {
        address: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
        priceUsd: "0.343701904777",
        quotedAt: "2026-09-23 08:09",
      },
    ]);
    expect(r.json.meta.warnings).toHaveLength(1);
    expect(r.json.meta.warnings[0]).toContain("Symbol");
  });

  // A field that can only ever be empty must not be in the envelope at all, and `view` is
  // text-mode scaffolding that JSON must never carry.
  it("publishes no symbols, warnings or view field inside data", () => {
    const r = run(["sunswap", "price", "TRX", "--network", "nile", "-o", "json"]);
    expect(r.json.data).not.toHaveProperty("symbols");
    expect(r.json.data).not.toHaveProperty("warnings");
    expect(r.json.data).not.toHaveProperty("view");
  });

  it("falls back to an em dash in the Symbol column rather than failing", () => {
    const r = run(["sunswap", "price", "TRX", "--network", "nile"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb");
    expect(r.stdout).toContain("$0.3437");
    expect(r.stdout).toContain("\u2014");
  });
});

/**
 * `sunswap position-info`, refused before anything is asked of a node.
 *
 * Nothing here reaches the network, which is what lets it live in this file: every case is decided
 * by the schema, the account gate or the family gate. The command itself READS THE CHAIN — a
 * successful lookup needs a node and belongs nowhere near a black-box suite.
 */
describe("sunswap position-info", () => {
  const ID = ["--position-id", "88"];

  it.each(["V2", "V1", "V1_5", "CURVE", "ALL", "v5"])(
    "refuses --protocol %s, which has no position ids",
    (protocol) => {
      const r = run([
        "sunswap",
        "position-info",
        "--protocol",
        protocol,
        ...ID,
        "--network",
        "tron",
        "-o",
        "json",
      ]);
      expect(r.status).toBe(2);
      expect(r.json.error.code).toBe("invalid_value");
      expect(r.json.error.message).toContain("--protocol");
    },
  );

  it.each(["-1", "1.5", "0x58", "eighty-eight"])(
    "refuses --position-id %s before asking a contract",
    (positionId) => {
      const r = run([
        "sunswap",
        "position-info",
        "--protocol",
        "V4",
        "--position-id",
        positionId,
        "--network",
        "tron",
        "-o",
        "json",
      ]);
      expect(r.status).toBe(2);
      expect(r.json.error.code).toBe("invalid_value");
      expect(r.json.error.message).toContain("--position-id");
    },
  );

  it.each([
    ["protocol", ["sunswap", "position-info", ...ID]],
    ["position-id", ["sunswap", "position-info", "--protocol", "V4"]],
  ])("requires --%s", (flag, args) => {
    const r = run([...args, "--network", "tron", "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("missing_option");
    expect(r.json.error.message).toContain(flag);
  });

  /**
   * `--account` is refused rather than ignored: this command reports whoever holds the position,
   * which is not the caller's account, and accepting the flag would suggest otherwise.
   */
  it("refuses --account outright", () => {
    const r = run([
      "sunswap",
      "position-info",
      "--protocol",
      "V4",
      ...ID,
      "--account",
      "main",
      "--network",
      "tron",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
    expect(r.json.error.message).toContain("--account");
  });

  it("refuses an EVM network on the family, before anything else", () => {
    const r = run([
      "sunswap",
      "position-info",
      "--protocol",
      "V4",
      ...ID,
      "--network",
      "sepolia",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("family_mismatch");
  });

  /**
   * Help, which must state the two things a caller gets wrong: that V2 has no id to look up, and
   * that V3 and V4 number their positions separately.
   */
  it("documents both flags and why --protocol is required", () => {
    const r = run(["sunswap", "position-info", "--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("--protocol <V3|V4>");
    expect(r.stdout).toContain("--position-id");
    expect(r.stdout).toContain("number their positions separately");
    expect(r.stdout).toContain("wallet-cli sunswap position-info --protocol V4 --position-id 88");
  });

  // No wallet exists in this HOME at all, and the command must not ask for one.
  it("needs no wallet and no password", () => {
    const r = run(["sunswap", "position-info", "--protocol", "V2", ...ID, "-o", "json"]);
    expect(r.json.error.code).not.toBe("auth_required");
    expect(r.json.error.code).not.toBe("no_account");
  });
});
