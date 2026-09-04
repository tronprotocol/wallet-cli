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
  // writeJsonAll is crash-safe but not CHANGE-safe — it deletes its own backups on
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

// The lock above is necessary but not sufficient. `plan()` reads OUTSIDE any lock — it has to,
// because the gate must know whether a password will be needed before it prompts for one — so the
// document travels through `notice`, `confirm` and an interactive password prompt before `commit()`
// takes the lock. Anything another process committed in that window is invisible to the snapshot,
// and writing the snapshot would erase it. Every case below writes the file between plan and apply
// to stand in for that other process.
describe("MigrationRunner re-reads under the lock", () => {
  it("does not erase an account another process added while the prompt was open", () => {
    const dir = root();
    const wallets = join(dir, "wallets.json");
    writeFileSync(wallets, JSON.stringify({ version: 1, wallets: [] }));

    const runner = new MigrationRunner(new AtomicFileStore());
    const plan = runner.plan([bumpStep(wallets)]); // reads v1, [] — the snapshot

    // process B: migrates under the lock, then creates an account
    writeFileSync(wallets, JSON.stringify({ version: 1, wallets: [{ id: "wlt_b.0" }] }));

    runner.apply(plan.stale);

    const after = JSON.parse(readFileSync(wallets, "utf8"));
    expect(after.wallets).toEqual([{ id: "wlt_b.0" }]);
    expect(after.version).toBe(2);
    expect(after.migrated).toBe(true);
  });

  it("backs up what was on disk at commit time, not the pre-lock snapshot", () => {
    const dir = root();
    const wallets = join(dir, "wallets.json");
    writeFileSync(wallets, JSON.stringify({ version: 1, wallets: [] }));

    const runner = new MigrationRunner(new AtomicFileStore());
    const plan = runner.plan([bumpStep(wallets)]);

    const current = { version: 1, wallets: [{ id: "wlt_b.0" }] };
    writeFileSync(wallets, JSON.stringify(current));

    runner.apply(plan.stale);

    expect(JSON.parse(readFileSync(`${wallets}.v1.bak`, "utf8"))).toEqual(current);
  });

  it("does nothing when another process already applied the same migration", () => {
    const dir = root();
    const wallets = join(dir, "wallets.json");
    writeFileSync(wallets, JSON.stringify({ version: 1, wallets: [] }));

    const runner = new MigrationRunner(new AtomicFileStore());
    const plan = runner.plan([bumpStep(wallets)]);

    const done = { version: 2, wallets: [{ id: "wlt_b.0" }], migrated: true };
    writeFileSync(wallets, JSON.stringify(done));

    runner.apply(plan.stale);

    expect(JSON.parse(readFileSync(wallets, "utf8"))).toEqual(done);
    // nothing was written, so no pre-migration copy was taken either
    expect(existsSync(`${wallets}.v1.bak`)).toBe(false);
    expect(existsSync(`${wallets}.v2.bak`)).toBe(false);
  });

  it("refuses to migrate a file that moved to an unexpected version", () => {
    const dir = root();
    const wallets = join(dir, "wallets.json");
    writeFileSync(wallets, JSON.stringify({ version: 1, wallets: [] }));

    const runner = new MigrationRunner(new AtomicFileStore());
    const plan = runner.plan([bumpStep(wallets)]);

    const newer = { version: 3, wallets: [] };
    writeFileSync(wallets, JSON.stringify(newer));

    expect(() => runner.apply(plan.stale)).toThrow(/changed/i);
    expect(JSON.parse(readFileSync(wallets, "utf8"))).toEqual(newer);
  });

  it("migrates the document on disk, not the one plan() captured", () => {
    const dir = root();
    const wallets = join(dir, "wallets.json");
    writeFileSync(wallets, JSON.stringify({ version: 1, note: "stale" }));

    const seen: unknown[] = [];
    const step: MigrationStep = {
      ...bumpStep(wallets),
      migrate: (doc) => {
        seen.push(doc);
        return { ...(doc as object), version: 2 };
      },
    };

    const runner = new MigrationRunner(new AtomicFileStore());
    const plan = runner.plan([step]);
    writeFileSync(wallets, JSON.stringify({ version: 1, note: "fresh" }));
    runner.apply(plan.stale);

    expect(seen).toEqual([{ version: 1, note: "fresh" }]);
  });

  it("still leaves every file untouched when a later step's migration throws", () => {
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
    writeFileSync(wallets, JSON.stringify({ version: 1, wallets: [{ id: "wlt_b.0" }] }));

    expect(() => runner.apply(plan.stale)).toThrow(/boom/);
    expect(JSON.parse(readFileSync(wallets, "utf8"))).toEqual({
      version: 1,
      wallets: [{ id: "wlt_b.0" }],
    });
    expect(existsSync(`${wallets}.v1.bak`)).toBe(false);
  });
});
