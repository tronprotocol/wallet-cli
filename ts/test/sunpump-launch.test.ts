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
    /* not JSON */
  }
  return { stdout: r.stdout, stderr: r.stderr, status: r.status, json };
}

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
    for (const flag of ["--account", "--build-only", "--sign-only", "--wait", "--fee-limit"]) {
      expect(r.stdout).not.toContain(flag);
    }
    expect(r.stdout).not.toContain("--order-by");
  });

  it("states the new token is not owned by the local account", () => {
    const r = run(["sunpump", "launch", "--help"]);
    expect(r.stdout).toContain("NOT your active account");
    expect(r.stdout).toContain("not yours to move");
    expect(r.stdout).toContain("chosen by SunPump");
    expect(r.stdout).toContain("creates a real, permanent token");
  });
});
