/**
 * Black-box checks for the three SunPump read commands — `token-list`, `token-info` and
 * `token-search`.
 *
 * Every case here is refused at PARSE time, so none of them makes a request. That is deliberate:
 * this service answers a bad page window, an ordering it does not apply and an empty keyword with
 * a confident HTTP 200, so the refusals are the only thing protecting a caller from a plausible
 * wrong answer — and asserting them behind a live read would turn a rate-limited node into a
 * failure of the wrong test.
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
    /* not json */
  }
  return { stdout: r.stdout, stderr: r.stderr, status: r.status, json };
}

/**
 * The service pages by page NUMBER and size, so an offset that lands mid-page names rows no page
 * contains. Rounding it to a boundary would hand back rows nobody asked for while looking like
 * success, so the window is refused and the constraint is named in the message — a caller cannot
 * guess this rule from `--offset`'s description.
 */
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

  // The CLI's own ceiling: the service would serve 200, but this CLI fixes a page at 50.
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

/**
 * An ordering the service does not apply is refused rather than offered.
 *
 * `launched` is the case worth pinning: it is a real field on every token, and the service answers
 * an ordering by it with a 200 having quietly sorted by market cap while echoing the field name
 * back. Accepting it would print a market-cap ranking under a launch-date heading.
 */
describe("--order-by is limited to the orderings that are really applied", () => {
  it.each([
    ["token-list", ["sunpump", "token-list"]],
    ["token-search", ["sunpump", "token-search", "dog"]],
  ])("%s refuses launched", (_name, argv) => {
    const r = run([...argv, "--order-by", "launched", "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
    expect(r.json.error.message).toContain("--order-by");
    // The refusal has to name what IS available, or a caller cannot recover from it.
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
    // Only that the direction parses: asserting the resulting order would need a live listing.
    const r = run(["sunpump", "token-list", "--sort", direction, "--limit", "51", "-o", "json"]);
    expect(r.json.error.code).toBe("limit_exceeded");
  });

  it("refuses a sort direction that is neither", () => {
    const r = run(["sunpump", "token-list", "--sort", "newest", "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
  });
});

/**
 * `--owner` answers from the by-creator endpoint, which DROPS ordering parameters instead of
 * rejecting them. Accepting `--order-by market-cap` beside it would print a creation-ordered list
 * under a market-cap heading, so the combination is refused.
 */
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

/**
 * A blank keyword is "no filter" to this service: it answers with the ranked whole catalogue at
 * HTTP 200, which reads exactly like a search that matched everything. Refused before any request.
 */
describe("a search needs something to search for", () => {
  it.each([[""], ["   "], ["\t"]])("refuses the keyword %j", (keyword) => {
    const r = run(["sunpump", "token-search", keyword, "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
    expect(r.json.error.message).toContain("--keyword");
    expect(r.json.error.message).toContain("must not be empty");
  });

  it("requires the keyword at all", () => {
    const r = run(["sunpump", "token-search", "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("missing_option");
  });
});

/**
 * The launchpad indexer is mainnet only, and the gate is the network's own config block rather
 * than a branch on its id — a tester opens Nile in config.yaml and no code changes.
 */
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

/**
 * Help, per command: the flags it serves are listed, and the flags of its neighbours are not —
 * these three commands share a prefix and half their flags, so the difference has to be visible.
 */
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
    // Searching by name is the other command's job, and help says so rather than leaving a caller
    // to try --contract with a symbol.
    expect(r.stdout).toContain("sunpump token-search");
    // The trap in every paged listing here: the total is always 0, even on a full page.
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
    // A symbol identifies nothing: acting on the wrong row of a search is the real hazard here.
    expect(r.stdout).toContain("NOT unique");
  });

  it("token-info takes one address and none of the listing flags", () => {
    const r = run(["sunpump", "token-info", "--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("<address>");
    for (const flag of ["--limit", "--offset", "--order-by", "--sort", "--owner", "--contract"]) {
      expect(r.stdout).not.toContain(flag);
    }
    // An unknown address comes back 200 and empty, so the not-found answer is documented.
    expect(r.stdout).toContain("launchpad_token_not_found");
    // Creator-supplied text reaches an agent's context; help marks it untrusted.
    expect(r.stdout).toContain("untrusted text");
  });
});
