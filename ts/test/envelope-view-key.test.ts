/**
 * `view` is reserved inside `data` and must never be published.
 *
 * It is the one place where text output can show something JSON output cannot reach, which cuts
 * against this CLI's premise that JSON is the complete output. The narrow rule that keeps it
 * honest — a field lives in `view` only when a specification says JSON must not carry it — is a
 * convention, and a convention with no test is a comment. This is the test.
 *
 * It sweeps commands that produce a success envelope without a wallet, a password or a network
 * call, which is the widest set reachable as a black box. The per-command case for `sunswap
 * price` lives with its own suite; this one holds the line across the surface.
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
  HOME = mkdtempSync(join(tmpdir(), "wcli-view-"));
});

function run(args: string[]) {
  const env = { ...process.env, WALLET_CLI_HOME: HOME } as Record<string, string>;
  delete env.MASTER_PASSWORD;
  const r = spawnSync(process.execPath, [...ENTRY_ARGS, ...args, "-o", "json"], {
    encoding: "utf8",
    env,
    timeout: 25_000,
    ...DETACHED,
  } as SpawnSyncOptionsWithStringEncoding);
  try {
    return JSON.parse(r.stdout);
  } catch {
    return undefined;
  }
}

/** every command that answers successfully with no wallet, no password and no network call. */
const OFFLINE_COMMANDS: string[][] = [
  ["config"],
  ["networks"],
  ["list"],
  ["contact", "list"],
  ["encoding", "convert", "--value", "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7"],
  ["address"],
  ["token", "list", "--network", "tron"],
];

describe("the reserved view key is never published", () => {
  it.each(OFFLINE_COMMANDS)("%s", (...args: string[]) => {
    const envelope = run(args);
    if (!envelope?.success) return; // a refusal is fine; it carries no data to leak
    expect(JSON.stringify(envelope)).not.toContain('"view"');
  });

  // The command that actually uses the key: its text column is filled, its envelope is not.
  it("holds for the command that uses it", () => {
    const envelope = run(["sunswap", "price", "TRX", "--network", "nile"]);
    expect(JSON.stringify(envelope)).not.toContain('"view"');
  });
});
