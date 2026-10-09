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

// A built entry (WALLET_CLI_TEST_ENTRY, set by vitest.config for the golden project) runs as
// plain `node <entry>`; without one, the TypeScript source is executed through tsx per spawn.
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

// Secret model: master password via stdin (--password-stdin); two-secret import is
// interactive so it can't run as a black-box subprocess — wallet setup uses seedWallet() to write
// the keystore in-process instead. No MASTER_PASSWORD env. password:null → no source (auth_required).
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
  // 25s < the suite's 30s testTimeout: a genuinely hung subprocess errors here with a clear
  // signal instead of silently eating the whole test budget.
  // `node --import tsx` executes the same TypeScript entry without the tsx CLI's IPC control
  // socket, so black-box tests also run in restricted CI/sandbox environments.
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
    /* not json */
  }
  return { stdout: r.stdout, stderr: r.stderr, status: r.status, json };
}

// Write the keystore directly (bypassing the now-interactive CLI import) so wallet-dependent
// tests have a funded identity; the seed is encrypted with DEFAULT_PW, matching run()'s default.
const seedFixtures = new Map<string, { root: string; accountId: string }>();
afterAll(() => {
  for (const { root } of seedFixtures.values()) rmSync(root, { recursive: true, force: true });
});

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
  // Copy real encrypted data into each test's private home. Mutations never reach the fixture;
  // the CLI still uses the production KDF to unlock it. Only repeated setup encryption is saved.
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

// Write a user-layer token directly (bypassing the live-RPC `token add` path) so list/remove
// can be exercised deterministically — mirrors seedWallet()'s in-process keystore approach.
export function seedToken(networkId: string, ref: string, entry: TokenEntry) {
  new TokenBook(testHome, new AtomicFileStore()).add(networkId, ref, entry);
}
