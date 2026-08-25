import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AtomicFileStore } from "../adapters/outbound/persistence/fs/index.js";
import { MigrationRunner, type MigrationStep } from "../adapters/outbound/persistence/migration.js";
import { runMigrationGate } from "./migration-gate.js";
import { upgradeNotice } from "./runner.js";
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

    const error = await runMigrationGate(runner, [stalePasswordStep(wallets, true)], {
      password: async () => null,
    })
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

    await runMigrationGate(runner, [stalePasswordStep(wallets, false)], { password: obtain });

    expect(obtain).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(wallets, "utf8")).version).toBe(2);
  });

  it("hands the supplied password to the migration that asked for it", async () => {
    const wallets = join(seededRoot(), "wallets.json");
    const runner = new MigrationRunner(new AtomicFileStore());

    await runMigrationGate(runner, [stalePasswordStep(wallets, true)], {
      password: async () => "hunter2",
    });

    expect(JSON.parse(readFileSync(wallets, "utf8")).sawPassword).toBe("hunter2");
  });

  it("asks for nothing and writes nothing when every file is current", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gate-"));
    const wallets = join(dir, "wallets.json");
    writeFileSync(wallets, JSON.stringify({ version: 2, wallets: [] }));
    const runner = new MigrationRunner(new AtomicFileStore());
    const obtain = vi.fn(async () => "nope");

    await runMigrationGate(runner, [stalePasswordStep(wallets, true)], { password: obtain });

    expect(obtain).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(wallets, "utf8"))).toEqual({ version: 2, wallets: [] });
  });
});

/**
 * Consent. The gate rewrites the user's wallet file and needs their master password to do it, so
 * in a terminal it must SAY so and take an answer first. Before this it did neither: the whole
 * upgrade surfaced as a bare "Master password (hidden):" prompt with no explanation, no mention
 * that a file was about to be rewritten, and no way to decline except Ctrl+C.
 */
describe("runMigrationGate consent", () => {
  it("asks before touching anything, and asks before asking for the password", async () => {
    const wallets = join(seededRoot(), "wallets.json");
    const runner = new MigrationRunner(new AtomicFileStore());
    const order: string[] = [];

    await runMigrationGate(runner, [stalePasswordStep(wallets, true)], {
      confirm: async () => {
        order.push("confirm");
        return true;
      },
      password: async () => {
        order.push("password");
        return "hunter2";
      },
    });

    expect(order).toEqual(["confirm", "password"]);
    expect(JSON.parse(readFileSync(wallets, "utf8")).version).toBe(2);
  });

  it("declining leaves the file untouched and never asks for the password", async () => {
    const wallets = join(seededRoot(), "wallets.json");
    const runner = new MigrationRunner(new AtomicFileStore());
    const password = vi.fn(async () => "hunter2");

    const error = await runMigrationGate(runner, [stalePasswordStep(wallets, true)], {
      confirm: async () => false,
      password,
    })
      .then(() => null)
      .catch((e: unknown) => e as CliError);

    expect(error?.code).toBe("migration_required");
    expect(error?.exitCode()).toBe(2);
    expect(password).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(wallets, "utf8"))).toEqual({ version: 1, wallets: [] });
  });

  it("tells a user who declined how to proceed", async () => {
    const wallets = join(seededRoot(), "wallets.json");
    const runner = new MigrationRunner(new AtomicFileStore());

    const error = await runMigrationGate(runner, [stalePasswordStep(wallets, true)], {
      confirm: async () => false,
      password: async () => "hunter2",
    }).catch((e: unknown) => e as CliError);

    expect(error?.message).toMatch(/declined/i);
    expect(error?.message).toMatch(/--password-stdin/);
  });

  it("does not ask consent for a secretless upgrade — ADR-0008 keeps that silent", async () => {
    const wallets = join(seededRoot(), "wallets.json");
    const runner = new MigrationRunner(new AtomicFileStore());
    const confirm = vi.fn(async () => true);

    await runMigrationGate(runner, [stalePasswordStep(wallets, false)], {
      confirm,
      password: async () => null,
    });

    expect(confirm).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(wallets, "utf8")).version).toBe(2);
  });

  it("asks nothing at all when every file is current", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gate-"));
    const wallets = join(dir, "wallets.json");
    writeFileSync(wallets, JSON.stringify({ version: 2, wallets: [] }));
    const confirm = vi.fn(async () => true);

    await runMigrationGate(
      new MigrationRunner(new AtomicFileStore()),
      [stalePasswordStep(wallets, true)],
      {
        confirm,
        password: async () => null,
      },
    );

    expect(confirm).not.toHaveBeenCalled();
  });

  it("describes what will change, so the caller can show it", async () => {
    const wallets = join(seededRoot(), "wallets.json");
    const runner = new MigrationRunner(new AtomicFileStore());
    let seen: { path: string; from: number; to: number; backup: string }[] = [];

    await runMigrationGate(runner, [stalePasswordStep(wallets, true)], {
      confirm: async (files) => {
        seen = files;
        return true;
      },
      password: async () => "hunter2",
    });

    expect(seen).toEqual([{ path: wallets, from: 1, to: 2, backup: `${wallets}.v1.bak` }]);
  });
});

describe("the upgrade notice", () => {
  const notice = () =>
    upgradeNotice([
      {
        path: "/home/u/.wallet-cli/wallets.json",
        from: 1,
        to: 2,
        backup: "/home/u/.wallet-cli/wallets.json.v1.bak",
      },
    ]).join("\n");

  it("names the file and shows the version change", () => {
    expect(notice()).toContain("/home/u/.wallet-cli/wallets.json");
    expect(notice()).toMatch(/v1\s*→\s*v2/);
  });

  it("explains that the upgrade is required before commands can run", () => {
    expect(notice()).toMatch(/must be upgraded/);
    expect(notice()).toMatch(/before any command can run/);
  });

  it("explains where the backup is kept", () => {
    expect(notice()).toContain("wallets.json.v1.bak");
    expect(notice()).toMatch(/never removed automatically/);
    expect(notice()).toMatch(/runs once/);
  });

  it("links to the release details", () => {
    expect(notice()).toContain("https://github.com/tronprotocol/wallet-cli/releases");
  });

  it("does not expose implementation details", () => {
    expect(notice()).not.toMatch(/EVM address|master password|decrypt|seed|leaves this machine/i);
  });
});
