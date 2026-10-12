/**
 * Black-box checks for `sunpump launch`.
 *
 * NOTHING here can create a token. A real launch mints a permanent, publicly visible token on
 * mainnet that cannot be deleted, renamed or disowned, so this file exercises only the refusals,
 * the network gate, `--dry-run` and help — every one of which is decided before the create
 * endpoint is called. That is also why the suite needs no account, no unlock and no reachable
 * node: a dry run assembles the request body and prints it without sending it.
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
  HOME = mkdtempSync(join(tmpdir(), "wcli-pump-launch-"));
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

/** The three fields a token carries forever. Guessed defaults would be a token nobody chose. */
describe("the fields a token cannot be created without", () => {
  it.each([
    ["name", ["--symbol", "MYT", "--description", "d"]],
    ["symbol", ["--name", "My Token", "--description", "d"]],
    ["description", ["--name", "My Token", "--symbol", "MYT"]],
  ])("refuses a launch with no --%s", (missing, given) => {
    const r = run(["sunpump", "launch", ...given, "--dry-run", "-o", "json"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("missing_option");
    expect(r.json.error.message).toContain(`--${missing}`);
  });
});

/**
 * A link is stored as given and cannot be corrected afterwards, so a scheme-less or wrong-scheme
 * URL is refused here rather than baked into a permanent token whose website goes nowhere.
 */
describe("links must be usable", () => {
  it.each([
    ["--website-url", "example.com"],
    ["--twitter-url", "ftp://x.test"],
    ["--telegram-url", "t.me/chan"],
  ])("refuses %s %s", (flag, value) => {
    const r = run([
      "sunpump",
      "launch",
      "--name",
      "My Token",
      "--symbol",
      "MYT",
      "--description",
      "d",
      flag,
      value,
      "--dry-run",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
    expect(r.json.error.message).toContain("must start with http:// or https://");
  });
});

describe("the logo", () => {
  // Two sources for one logo: whichever won silently, the caller would not know which image their
  // permanent token carries.
  it("refuses --image alongside --image-base64", () => {
    const r = run([
      "sunpump",
      "launch",
      "--name",
      "My Token",
      "--symbol",
      "MYT",
      "--description",
      "d",
      "--image",
      join(HOME, "logo.png"),
      "--image-base64",
      "QUJD",
      "--dry-run",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
    expect(r.json.error.message).toContain("two ways of supplying one logo");
  });

  // The file is read even for a dry run: a preview of a launch whose logo does not exist has
  // validated nothing, and the real call would then create a token with no image.
  it("refuses a missing --image file, and names the path", () => {
    const missing = join(HOME, "no-such-logo.png");
    const r = run([
      "sunpump",
      "launch",
      "--name",
      "My Token",
      "--symbol",
      "MYT",
      "--description",
      "d",
      "--image",
      missing,
      "--dry-run",
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("file_not_found");
    expect(r.json.error.message).toContain(missing);
  });
});

/**
 * `--account` is refused rather than ignored.
 *
 * SunPump chooses the new token's creator. Accepting an account would tell a caller their token
 * belongs to that account, which is the one false belief this command could create.
 */
it("refuses --account and says why the local account is not the owner", () => {
  const r = run([
    "sunpump",
    "launch",
    "--name",
    "My Token",
    "--symbol",
    "MYT",
    "--description",
    "d",
    "--account",
    "main",
    "--dry-run",
    "-o",
    "json",
  ]);
  expect(r.status).toBe(2);
  expect(r.json.error.code).toBe("invalid_option");
  expect(r.json.error.message).toContain("does not accept --account");
  expect(r.json.error.message).toContain("chooses its owner");
});

/**
 * The launchpad is mainnet only, and the gate is the network's own config block rather than a
 * branch on its id — so a tester can open Nile in config.yaml without a code change.
 */
describe("network availability", () => {
  it.each([["nile"], ["shasta"]])("refuses %s and names where it does work", (network) => {
    const r = run([
      "sunpump",
      "launch",
      "--name",
      "My Token",
      "--symbol",
      "MYT",
      "--description",
      "d",
      "--dry-run",
      "--network",
      network,
      "-o",
      "json",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("unsupported_network_capability");
    expect(r.json.error.message).toBe("sunpump launch is available on tron only");
  });
});

/**
 * The one success this file may assert: a dry run sends nothing at all.
 *
 * It exists to pin that the preview is the request body — a field the request would not carry must
 * not appear, because the preview is the only chance anyone gets to check a launch before it is
 * permanent. An option left off is omitted, never sent empty.
 */
it("previews a launch without sending it, and omits what was not given", () => {
  const r = run([
    "sunpump",
    "launch",
    "--name",
    "My Token",
    "--symbol",
    "MYT",
    "--description",
    "a demo token",
    "--website-url",
    "https://example.test",
    "--dry-run",
    "-o",
    "json",
  ]);
  expect(r.status).toBe(0);
  expect(r.json.success).toBe(true);
  expect(r.json.data.mode).toBe("dry-run");
  expect(r.json.data.name).toBe("My Token");
  expect(r.json.data.symbol).toBe("MYT");
  expect(r.json.data.links).toEqual({ website: "https://example.test" });
  expect(r.json.data).not.toHaveProperty("image");
  // A dry run has created nothing, so there is no token and no creator to report.
  expect(r.json.data).not.toHaveProperty("token");
});

describe("help", () => {
  it("serves the launch flags and none of the transaction flags", () => {
    const r = run(["sunpump", "launch", "--help"]);
    expect(r.status).toBe(0);
    for (const flag of [
      "--name",
      "--symbol",
      "--description",
      "--image",
      "--image-base64",
      "--twitter-url",
      "--telegram-url",
      "--website-url",
      "--dry-run",
    ]) {
      expect(r.stdout).toContain(flag);
    }
    // Nothing is signed or broadcast here, so none of the transaction machinery applies.
    for (const flag of ["--account", "--build-only", "--sign-only", "--wait", "--fee-limit"]) {
      expect(r.stdout).not.toContain(flag);
    }
    // Nor any of the listing flags, which belong to the read commands.
    expect(r.stdout).not.toContain("--order-by");
  });

  /**
   * The single misconception this command could plant, pinned so no future edit can drop it: the
   * token is created by SunPump and is NOT the local account's.
   */
  it("states the new token is not owned by the local account", () => {
    const r = run(["sunpump", "launch", "--help"]);
    expect(r.stdout).toContain("NOT your active account");
    expect(r.stdout).toContain("not yours to move");
    expect(r.stdout).toContain("chosen by SunPump");
    // And that a launch without --dry-run is irreversible.
    expect(r.stdout).toContain("creates a real, permanent token");
  });
});
