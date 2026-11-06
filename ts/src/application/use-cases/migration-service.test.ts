import { describe, it, expect, vi } from "vitest";
import { MigrationService, type MigrationPrompt } from "./migration-service.js";
import type { DataMigrations, PendingUpgrade } from "../ports/data-migration.js";
import { CliError } from "../../domain/errors/index.js";

const file: PendingUpgrade = {
  path: "/w/wallets.json",
  from: 1,
  to: 2,
  backup: "/w/wallets.json.v1.bak",
};

function migrations(pending: PendingUpgrade[], needsPassword: boolean, retained: string[] = []) {
  return {
    plan: vi.fn(() => ({ pending, needsPassword })),
    apply: vi.fn((_pending: PendingUpgrade[], _password?: string) => retained),
  } satisfies DataMigrations;
}

function prompt(overrides: Partial<MigrationPrompt> = {}) {
  return {
    interactive: true,
    notice: vi.fn(),
    confirm: vi.fn(async () => true),
    password: vi.fn(async (): Promise<string | null> => "hunter2"),
    applying: vi.fn(),
    ...overrides,
  };
}

describe("MigrationService", () => {
  it("asks nothing and writes nothing when nothing is pending", async () => {
    const data = migrations([], true);
    const p = prompt();

    expect(await new MigrationService(data).run(p)).toEqual({ status: "current", files: [] });
    expect(p.notice).not.toHaveBeenCalled();
    expect(p.confirm).not.toHaveBeenCalled();
    expect(p.password).not.toHaveBeenCalled();
    expect(data.apply).not.toHaveBeenCalled();
  });

  it("cancels without asking for the password or writing when the user declines", async () => {
    const data = migrations([file], true);
    const p = prompt({ confirm: vi.fn(async () => false) });

    expect(await new MigrationService(data).run(p)).toEqual({ status: "cancelled", files: [file] });
    expect(p.password).not.toHaveBeenCalled();
    expect(data.apply).not.toHaveBeenCalled();
  });

  it("refuses with migration_required when a password is needed but unavailable", async () => {
    const data = migrations([file], true);
    const p = prompt({ interactive: false, password: vi.fn(async () => null) });

    const error = await new MigrationService(data)
      .run(p)
      .then(() => null)
      .catch((e: unknown) => e as CliError);

    expect(error?.code).toBe("migration_required");
    expect(error?.kind).toBe("usage");
    expect(error?.message).toContain("pipe the master password with passwordStdin");
    expect(data.apply).not.toHaveBeenCalled();
  });

  it("asks consent, then the password, then applies with that password", async () => {
    const order: string[] = [];
    const data = migrations([file], true, ["/w/left.bak"]);
    const p = prompt({
      notice: (_pending, needsPassword) => order.push(`notice:${needsPassword}`),
      confirm: async () => {
        order.push("confirm");
        return true;
      },
      password: async () => {
        order.push("password");
        return "hunter2";
      },
      applying: () => order.push("applying"),
    });

    const outcome = await new MigrationService(data).run(p);

    expect(order).toEqual(["notice:true", "confirm", "password", "applying"]);
    expect(data.apply).toHaveBeenCalledWith([file], "hunter2");
    expect(outcome).toEqual({
      status: "upgraded",
      files: [file],
      retainedBackups: ["/w/left.bak"],
    });
  });

  it("applies a secretless upgrade without asking for a password", async () => {
    const data = migrations([file], false);
    const p = prompt();

    expect((await new MigrationService(data).run(p)).status).toBe("upgraded");
    expect(p.confirm).toHaveBeenCalledOnce();
    expect(p.password).not.toHaveBeenCalled();
    expect(data.apply).toHaveBeenCalledWith([file], undefined);
  });

  it("does not ask consent when no one can answer", async () => {
    const data = migrations([file], false);
    const p = prompt({ interactive: false });

    expect((await new MigrationService(data).run(p)).status).toBe("upgraded");
    expect(p.confirm).not.toHaveBeenCalled();
  });
});
