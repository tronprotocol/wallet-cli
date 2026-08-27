import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AtomicFileStore } from "./fs/index.js";
import { MigrationRunner, type MigrationStep } from "./migration.js";

function root(): string {
  return mkdtempSync(join(tmpdir(), "migration-"));
}

/** a step that bumps version and stamps a marker, so we can see it actually ran */
function bumpStep(path: string): MigrationStep {
  return {
    path,
    currentVersion: 2,
    needsPassword: () => false,
    migrate: (doc) => ({ ...(doc as object), version: 2, migrated: true }),
  };
}

describe("MigrationRunner.plan", () => {
  it("reports a file whose stored version lags the binary", () => {
    const dir = root();
    const wallets = join(dir, "wallets.json");
    writeFileSync(wallets, JSON.stringify({ version: 1, wallets: [] }));

    const plan = new AtomicFileStore();
    const result = new MigrationRunner(plan).plan([bumpStep(wallets)]);

    expect(result.stale.map((s) => s.step.path)).toEqual([wallets]);
    expect(result.needsPassword).toBe(false);
  });
});

describe("MigrationRunner.apply", () => {
  it("writes each stale file's migrated document", () => {
    const dir = root();
    const wallets = join(dir, "wallets.json");
    writeFileSync(wallets, JSON.stringify({ version: 1, wallets: [] }));

    const runner = new MigrationRunner(new AtomicFileStore());
    runner.apply(runner.plan([bumpStep(wallets)]).stale);

    expect(JSON.parse(readFileSync(wallets, "utf8"))).toEqual({
      version: 2,
      wallets: [],
      migrated: true,
    });
  });
});

describe("MigrationRunner pre-migration backup", () => {
  // ADR-0008: writeJsonAll is crash-safe but not CHANGE-safe — it deletes its own backups on
  // success. A migration that succeeds but is wrong would otherwise destroy the only copy.
  it("keeps a copy of each file's pre-migration content", () => {
    const dir = root();
    const wallets = join(dir, "wallets.json");
    const before = { version: 1, wallets: [], labels: { "wlt_a.0": "main" } };
    writeFileSync(wallets, JSON.stringify(before));

    const runner = new MigrationRunner(new AtomicFileStore());
    runner.apply(runner.plan([bumpStep(wallets)]).stale);

    expect(JSON.parse(readFileSync(`${wallets}.v1.bak`, "utf8"))).toEqual(before);
  });
});

describe("MigrationRunner atomicity", () => {
  it("leaves every file untouched when one step's migration throws", () => {
    const dir = root();
    const wallets = join(dir, "wallets.json");
    const contacts = join(dir, "contacts.json");
    writeFileSync(wallets, JSON.stringify({ version: 1, wallets: [] }));
    writeFileSync(contacts, JSON.stringify({ version: 1, entries: {} }));

    const exploding: MigrationStep = {
      path: contacts,
      currentVersion: 2,
      needsPassword: () => false,
      migrate: () => {
        throw new Error("boom");
      },
    };

    const runner = new MigrationRunner(new AtomicFileStore());
    const plan = runner.plan([bumpStep(wallets), exploding]);

    expect(() => runner.apply(plan.stale)).toThrow(/boom/);
    expect(JSON.parse(readFileSync(wallets, "utf8"))).toEqual({ version: 1, wallets: [] });
    expect(existsSync(`${wallets}.v1.bak`)).toBe(false);
  });

  it("writes nothing when no file is stale", () => {
    const dir = root();
    const wallets = join(dir, "wallets.json");
    writeFileSync(wallets, JSON.stringify({ version: 2, wallets: [] }));

    const runner = new MigrationRunner(new AtomicFileStore());
    runner.apply(runner.plan([bumpStep(wallets)]).stale);

    expect(readdirSync(dir)).toEqual(["wallets.json"]);
  });
});

// Every keystore mutator wraps its read-modify-write in withLock; the migration did not. The
// race it opens is the worst kind: process A reads the v1 document and blocks on an interactive
// password prompt while process B migrates and creates an account under the lock; A then writes
// the migration of its now-stale read, erasing B's account and orphaning its encrypted key blob.
describe("MigrationRunner holds the file lock while it writes", () => {
  it("takes the lock for the files it migrates", () => {
    const dir = root();
    const wallets = join(dir, "wallets.json");
    writeFileSync(wallets, JSON.stringify({ version: 1, wallets: [] }));

    const locked: string[] = [];
    const store = new AtomicFileStore();
    const realLock = store.withLock.bind(store);
    store.withLock = ((path: string, fn: () => unknown, opts?: unknown) => {
      locked.push(path);
      return realLock(path, fn as () => never, opts as never);
    }) as typeof store.withLock;

    const runner = new MigrationRunner(store);
    runner.apply(runner.plan([bumpStep(wallets)]).stale);

    expect(locked).toContain(wallets);
  });

  it("still writes the migrated document while holding it", () => {
    const dir = root();
    const wallets = join(dir, "wallets.json");
    writeFileSync(wallets, JSON.stringify({ version: 1, wallets: [] }));

    const runner = new MigrationRunner(new AtomicFileStore());
    runner.apply(runner.plan([bumpStep(wallets)]).stale);

    expect(JSON.parse(readFileSync(wallets, "utf8")).version).toBe(2);
  });
});
