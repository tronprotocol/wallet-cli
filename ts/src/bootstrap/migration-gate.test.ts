import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AtomicFileStore } from "../adapters/outbound/persistence/fs/index.js";
import { MigrationRunner, type MigrationStep } from "../adapters/outbound/persistence/migration.js";
import { runMigrationGate } from "./migration-gate.js";
import { upgradeCancelledNotice, upgradeCompleteNotice, upgradeNotice } from "./runner.js";
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

  it("migrates without asking for a password when no stale file needs one", async () => {
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
 * Consent. The gate rewrites the user's wallet file, independently of whether it needs a password,
 * so an interactive caller must always be able to explain the plan and take an answer first.
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

  it("exiting leaves the file untouched and never asks for the password", async () => {
    const wallets = join(seededRoot(), "wallets.json");
    const runner = new MigrationRunner(new AtomicFileStore());
    const password = vi.fn(async () => "hunter2");

    const outcome = await runMigrationGate(runner, [stalePasswordStep(wallets, true)], {
      confirm: async () => false,
      password,
    });

    expect(outcome).toEqual({
      status: "cancelled",
      files: [{ path: wallets, from: 1, to: 2, backup: `${wallets}.v1.bak` }],
    });
    expect(password).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(wallets, "utf8"))).toEqual({ version: 1, wallets: [] });
  });

  it("reports cancellation as an outcome rather than an error", async () => {
    const wallets = join(seededRoot(), "wallets.json");
    const runner = new MigrationRunner(new AtomicFileStore());

    const outcome = await runMigrationGate(runner, [stalePasswordStep(wallets, true)], {
      confirm: async () => false,
      password: async () => "hunter2",
    });

    expect(outcome.status).toBe("cancelled");
  });

  it("asks consent for a secretless upgrade but never asks for a password", async () => {
    const wallets = join(seededRoot(), "wallets.json");
    const runner = new MigrationRunner(new AtomicFileStore());
    const confirm = vi.fn(async () => true);
    const password = vi.fn(async () => "should-not-be-asked");

    await runMigrationGate(runner, [stalePasswordStep(wallets, false)], {
      confirm,
      password,
    });

    expect(confirm).toHaveBeenCalledOnce();
    expect(password).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(wallets, "utf8")).version).toBe(2);
  });

  it("lets a user exit a secretless upgrade without changing the file", async () => {
    const wallets = join(seededRoot(), "wallets.json");

    const outcome = await runMigrationGate(
      new MigrationRunner(new AtomicFileStore()),
      [stalePasswordStep(wallets, false)],
      { confirm: async () => false, password: async () => null },
    );

    expect(outcome.status).toBe("cancelled");
    expect(JSON.parse(readFileSync(wallets, "utf8"))).toEqual({ version: 1, wallets: [] });
    expect(() => readFileSync(`${wallets}.v1.bak`, "utf8")).toThrow();
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

  it("reports the plan before applying it and returns the completed upgrades", async () => {
    const wallets = join(seededRoot(), "wallets.json");
    const events: string[] = [];

    const outcome = await runMigrationGate(
      new MigrationRunner(new AtomicFileStore()),
      [stalePasswordStep(wallets, false)],
      {
        notice: (pending, needsPassword) => {
          events.push(`notice:${pending[0]?.from}->${pending[0]?.to}:${needsPassword}`);
        },
        password: async () => null,
        applying: () => events.push("applying"),
      },
    );

    expect(events).toEqual(["notice:1->2:false", "applying"]);
    expect(outcome).toEqual({
      status: "upgraded",
      files: [{ path: wallets, from: 1, to: 2, backup: `${wallets}.v1.bak` }],
    });
  });

  it("reports nothing and returns no upgrades when every file is current", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gate-"));
    const wallets = join(dir, "wallets.json");
    writeFileSync(wallets, JSON.stringify({ version: 2, wallets: [] }));
    const notice = vi.fn();
    const applying = vi.fn();

    const outcome = await runMigrationGate(
      new MigrationRunner(new AtomicFileStore()),
      [stalePasswordStep(wallets, false)],
      { notice, applying, password: async () => null },
    );

    expect(outcome).toEqual({ status: "current", files: [] });
    expect(notice).not.toHaveBeenCalled();
    expect(applying).not.toHaveBeenCalled();
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

  it("explains that the upgrade is required", () => {
    expect(notice()).toMatch(/upgrade is required/);
  });

  it("explains where the backup is kept", () => {
    expect(notice()).toContain("wallets.json.v1.bak");
    expect(notice()).toMatch(/kept permanently/);
    expect(notice()).toMatch(/runs only once/);
  });

  it("links to the release details", () => {
    expect(notice()).toContain("https://github.com/tronprotocol/wallet-cli/releases");
  });

  it("does not expose implementation details", () => {
    expect(notice()).not.toMatch(/EVM address|decrypt|seed|leaves this machine/i);
  });

  it("only mentions a master password when the migration needs one", () => {
    expect(notice()).toMatch(/master password/i);
    expect(
      upgradeNotice(
        [
          {
            path: "/home/u/.wallet-cli/wallets.json",
            from: 1,
            to: 2,
            backup: "/home/u/.wallet-cli/wallets.json.v1.bak",
          },
        ],
        false,
      ).join("\n"),
    ).not.toMatch(/master password/i);
  });
});

describe("the upgrade completion notice", () => {
  const complete = upgradeCompleteNotice([
    {
      path: "/home/u/.wallet-cli/wallets.json",
      from: 1,
      to: 2,
      backup: "/home/u/.wallet-cli/wallets.json.v1.bak",
    },
  ]).join("\n");

  it("confirms success and concisely tells the user to run the command again", () => {
    expect(complete).toMatch(/completed successfully/i);
    expect(complete).toContain("🎉 Upgrade complete. Please run your command again.");
    expect(complete).toContain("wallets.json.v1.bak");
  });
});

describe("the upgrade cancellation notice", () => {
  const cancelled = upgradeCancelledNotice([
    {
      path: "/home/u/.wallet-cli/wallets.json",
      from: 1,
      to: 2,
      backup: "/home/u/.wallet-cli/wallets.json.v1.bak",
    },
  ]).join("\n");

  it("describes an unsupported schema and the compatible-release option without calling it an error", () => {
    expect(cancelled).toContain("Wallet data was not upgraded. No changes were made.");
    expect(cancelled).toContain("wallets.json: schema v1 (requires v2)");
    expect(cancelled).toMatch(/compatible earlier release/i);
    expect(cancelled).toContain("https://github.com/tronprotocol/wallet-cli/releases");
    expect(cancelled).not.toMatch(/error|migration_required|password-stdin/i);
  });
});
