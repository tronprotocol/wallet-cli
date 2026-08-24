import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AtomicFileStore } from "../adapters/outbound/persistence/fs/index.js";
import { MigrationRunner, type MigrationStep } from "../adapters/outbound/persistence/migration.js";
import { runMigrationGate } from "./migration-gate.js";
import { CliError } from "../domain/errors/index.js";

function stalePasswordStep(path: string, needsPassword: boolean): MigrationStep {
  return {
    path,
    currentVersion: 2,
    needsPassword: () => needsPassword,
    migrate: (doc, password) => ({ ...(doc as object), version: 2, sawPassword: password ?? null }),
  };
}

function seededRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "gate-"));
  writeFileSync(join(dir, "wallets.json"), JSON.stringify({ version: 1, wallets: [] }));
  return dir;
}

describe("runMigrationGate", () => {
  it("refuses with migration_required when a password is needed but unavailable", async () => {
    const wallets = join(seededRoot(), "wallets.json");
    const runner = new MigrationRunner(new AtomicFileStore());

    const error = await runMigrationGate(runner, [stalePasswordStep(wallets, true)], async () => null)
      .then(() => null)
      .catch((e: unknown) => e as CliError);

    expect(error?.code).toBe("migration_required");
    expect(error?.exitCode()).toBe(2);
    // and it changed nothing
    expect(JSON.parse(readFileSync(wallets, "utf8"))).toEqual({ version: 1, wallets: [] });
  });

  it("migrates silently when no stale file needs a password", async () => {
    const wallets = join(seededRoot(), "wallets.json");
    const runner = new MigrationRunner(new AtomicFileStore());
    const obtain = vi.fn(async () => "should-not-be-asked");

    await runMigrationGate(runner, [stalePasswordStep(wallets, false)], obtain);

    expect(obtain).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(wallets, "utf8")).version).toBe(2);
  });

  it("hands the supplied password to the migration that asked for it", async () => {
    const wallets = join(seededRoot(), "wallets.json");
    const runner = new MigrationRunner(new AtomicFileStore());

    await runMigrationGate(runner, [stalePasswordStep(wallets, true)], async () => "hunter2");

    expect(JSON.parse(readFileSync(wallets, "utf8")).sawPassword).toBe("hunter2");
  });

  it("asks for nothing and writes nothing when every file is current", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gate-"));
    const wallets = join(dir, "wallets.json");
    writeFileSync(wallets, JSON.stringify({ version: 2, wallets: [] }));
    const runner = new MigrationRunner(new AtomicFileStore());
    const obtain = vi.fn(async () => "nope");

    await runMigrationGate(runner, [stalePasswordStep(wallets, true)], obtain);

    expect(obtain).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(wallets, "utf8"))).toEqual({ version: 2, wallets: [] });
  });
});
