import { beforeEach, afterEach, afterAll } from "vitest";
import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from "node:child_process";
import { mkdtempSync, readFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Keystore } from "../src/adapters/outbound/keystore/index.js";
import { TokenBook } from "../src/adapters/outbound/tokenbook/index.js";
import { AtomicFileStore } from "../src/adapters/outbound/persistence/fs/index.js";
import type { TokenEntry, WalletsFile } from "../src/domain/types/index.js";
import { DETACHED } from "./detached.js";

const ENTRY_ARGS = process.env.WALLET_CLI_TEST_ENTRY
  ? [process.env.WALLET_CLI_TEST_ENTRY]
  : ["--import", "tsx", join(process.cwd(), "src", "index.ts")];
export const PACKAGE_VERSION = (
  JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version: string }
).version;
export const MNEMONIC = "test test test test test test test test test test test junk";
export const TRON1 = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
export const DEFAULT_PW = "testpw123A";

export let testHome: string;
beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "wcli-"));
});
afterEach(() => rmSync(testHome, { recursive: true, force: true }));

// password: null disables password stdin; otherwise the password replaces input.
export function run(args: string[], opts: { input?: string; password?: string | null } = {}) {
  const env: Record<string, string> = { ...process.env, WALLET_CLI_HOME: testHome } as Record<
    string,
    string
  >;
  delete env.MASTER_PASSWORD;
  const finalArgs = [...args];
  let stdin = opts.input;
  if (opts.password !== null) {
    finalArgs.push("--password-stdin");
    stdin = (opts.password ?? DEFAULT_PW) + "\n";
  }
  // Leave time for subprocess failures to surface before the test timeout.
  // --import tsx avoids the tsx CLI control socket in restricted environments.
  const r = spawnSync(process.execPath, [...ENTRY_ARGS, ...finalArgs], {
    input: stdin,
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

const seedFixtures = new Map<string, { root: string; accountId: string }>();
afterAll(() => {
  for (const { root } of seedFixtures.values()) rmSync(root, { recursive: true, force: true });
});

// Seed directly because secret import requires a TTY.
export function seedWallet(label = "main") {
  let fixture = seedFixtures.get(label);
  if (!fixture) {
    const root = mkdtempSync(join(tmpdir(), "wcli-seed-fixture-"));
    const ks = new Keystore(root, new AtomicFileStore(), () => DEFAULT_PW);
    try {
      const { accountId } = ks.import({ secret: MNEMONIC, type: "seed", label });
      fixture = { root, accountId };
      seedFixtures.set(label, fixture);
    } catch (error) {
      rmSync(root, { recursive: true, force: true });
      throw error;
    }
  }
  // Each test gets its own encrypted copy; CLI unlocks still use the production KDF.
  cpSync(fixture.root, testHome, { recursive: true });
  return fixture.accountId;
}

export function seedLegacyWallet() {
  const accountId = seedWallet();
  const store = new AtomicFileStore();
  const path = join(testHome, "wallets.json");
  const file = store.readJson<WalletsFile>(path)!;
  const source = file.wallets[0]!.source as Extract<
    WalletsFile["wallets"][0]["source"],
    { type: "seed" }
  >;
  source.addresses["1"] = {
    tron: "TCjow1qG4ZvDNj5ZRCF2RSuS2kMCGKK1JJ",
    evm: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  };
  store.writeJsonAll([{ path, value: file }]);
  return accountId.split(".")[0]!;
}

// Seed directly to avoid the live RPC reads required by token add.
export function seedToken(networkId: string, ref: string, entry: TokenEntry) {
  new TokenBook(testHome, new AtomicFileStore()).add(networkId, ref, entry);
}
