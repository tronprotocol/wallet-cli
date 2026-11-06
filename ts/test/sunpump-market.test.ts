import { describe, it, expect, beforeEach } from "vitest";
import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DETACHED } from "./detached.js";

const ENTRY_ARGS = process.env.WALLET_CLI_TEST_ENTRY
  ? [process.env.WALLET_CLI_TEST_ENTRY]
  : ["--import", "tsx", join(process.cwd(), "src", "index.ts")];

const TOKEN = "TX5eXdf8458bZ77fk8xdvUgiQmC3L93iv7";
const OWNER = "TQRxQNvnALSe5N27uXC47j6HExS9WGT4kj";

let HOME: string;
beforeEach(() => {
  HOME = mkdtempSync(join(tmpdir(), "wcli-pump-market-"));
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

describe("the page window must fall on a page boundary", () => {
  it.each([
    ["token-list", ["sunpump", "token-list"]],
    ["token-search", ["sunpump", "token-search", "dog"]],
  ])("%s refuses an --offset that is not a multiple of --limit", (_name, argv) => {
    const r = run([...argv, "--limit", "4", "--offset", "5", "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
    expect(r.json.error.message).toContain("--offset");
    expect(r.json.error.message).toContain("must be a multiple of --limit (4)");
  });

  it.each([
    ["token-list", ["sunpump", "token-list"]],
    ["token-search", ["sunpump", "token-search", "dog"]],
  ])("%s refuses a page larger than the ceiling", (_name, argv) => {
    const r = run([...argv, "--limit", "51", "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("limit_exceeded");
    expect(r.json.error.message).toContain("at most 50");
  });
});

describe("--order-by is limited to the orderings that are really applied", () => {
  it.each([
    ["token-list", ["sunpump", "token-list"]],
    ["token-search", ["sunpump", "token-search", "dog"]],
  ])("%s refuses launched", (_name, argv) => {
    const r = run([...argv, "--order-by", "launched", "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
    expect(r.json.error.message).toContain("--order-by");
    for (const allowed of ["created", "market-cap", "volume-24h", "price-change-24h"]) {
      expect(r.json.error.message).toContain(allowed);
    }
    expect(r.json.error.message).not.toContain('"launched"');
  });

  it("refuses an ordering that is not a field at all", () => {
    const r = run(["sunpump", "token-list", "--order-by", "holders", "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
  });

  it.each([["asc"], ["desc"]])("accepts --sort %s as a direction", (direction) => {
    // The limit error proves the direction parsed without requiring a live listing.
    const r = run(["sunpump", "token-list", "--sort", direction, "--limit", "51", "-o", "json"]);
    expect(r.json.error.code).toBe("limit_exceeded");
  });

  it("refuses a sort direction that is neither", () => {
    const r = run(["sunpump", "token-list", "--sort", "newest", "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
  });
});

describe("--owner cannot be ordered", () => {
  it.each([
    ["--order-by", "market-cap"],
    ["--sort", "asc"],
  ])("refuses %s alongside --owner", (flag, value) => {
    const r = run(["sunpump", "token-list", "--owner", OWNER, flag, value, "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
    expect(r.json.error.message).toContain(flag);
    expect(r.json.error.message).toContain("always ordered by created, desc");
  });
});

describe("a search needs something to search for", () => {
  it.each([[""], ["   "], ["\t"]])("refuses the keyword %j", (keyword) => {
    const r = run(["sunpump", "token-search", keyword, "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
    expect(r.json.error.message).toContain("<keyword>");
    expect(r.json.error.message).toContain("must not be empty");
  });

  it("requires the keyword at all", () => {
    const r = run(["sunpump", "token-search", "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("missing_option");
  });
});

describe("network availability", () => {
  it.each([
    ["token-list", "nile", ["sunpump", "token-list"]],
    ["token-list", "shasta", ["sunpump", "token-list"]],
    ["token-info", "nile", ["sunpump", "token-info", TOKEN]],
    ["token-search", "nile", ["sunpump", "token-search", "dog"]],
  ])("%s refuses %s and names where it does work", (command, network, argv) => {
    const r = run([...(argv as string[]), "--network", network, "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("unsupported_network_capability");
    expect(r.json.error.message).toBe(`sunpump ${command} is available on tron only`);
  });

  it("refuses an EVM network on the family, before the capability gate", () => {
    const r = run(["sunpump", "token-list", "--network", "sepolia", "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("family_mismatch");
  });
});

describe("token-info", () => {
  it("refuses an address that is not one", () => {
    const r = run(["sunpump", "token-info", "not-an-address", "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_address");
  });
});

describe("help", () => {
  it("token-list serves the filters and the page window, not the search flags", () => {
    const r = run(["sunpump", "token-list", "--help"]);
    expect(r.status).toBe(0);
    for (const flag of ["--contract", "--owner", "--order-by", "--sort", "--limit", "--offset"]) {
      expect(r.stdout).toContain(flag);
    }
    for (const flag of ["--on-sunswap", "--twitter-launch", "--sun-agent-launch"]) {
      expect(r.stdout).not.toContain(flag);
    }
    expect(r.stdout).toContain("sunpump token-search");
    expect(r.stdout).toContain("no result total");
  });

  it("token-search serves the keyword and its filters, not the listing filters", () => {
    const r = run(["sunpump", "token-search", "--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("keyword");
    for (const flag of [
      "--on-sunswap",
      "--twitter-launch",
      "--sun-agent-launch",
      "--order-by",
      "--limit",
      "--offset",
    ]) {
      expect(r.stdout).toContain(flag);
    }
    for (const flag of ["--contract", "--owner"]) {
      expect(r.stdout).not.toContain(flag);
    }
    expect(r.stdout).toContain("NOT unique");
  });

  it("token-info takes one address and none of the listing flags", () => {
    const r = run(["sunpump", "token-info", "--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("<address>");
    for (const flag of ["--limit", "--offset", "--order-by", "--sort", "--owner", "--contract"]) {
      expect(r.stdout).not.toContain(flag);
    }
    expect(r.stdout).toContain("launchpad_token_not_found");
    expect(r.stdout).toContain("untrusted text");
  });
});
