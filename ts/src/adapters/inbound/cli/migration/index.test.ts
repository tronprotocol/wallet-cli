import { describe, it, expect, vi } from "vitest";
import {
  cliMigrationPrompt,
  renderMigrationOutcome,
  upgradeCancelledNotice,
  upgradeCompleteNotice,
  upgradeNotice,
} from "./index.js";
import { StreamManager } from "../stream/index.js";
import { createOutputFormatter } from "../output/index.js";

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

const file = { path: "/home/u/.wallet-cli/wallets.json", from: 1, to: 2, backup: "/b/w.v1.bak" };

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  const streams = new StreamManager(
    "json",
    false,
    (s) => out.push(s),
    (s) => err.push(s),
  );
  return { out, err, streams, formatter: createOutputFormatter("json", streams, Date.now()) };
}

describe("renderMigrationOutcome", () => {
  it("lets the command run when nothing was pending", () => {
    const { out, streams, formatter } = capture();
    expect(renderMigrationOutcome({ status: "current", files: [] }, streams, formatter)).toBe(
      false,
    );
    expect(out).toEqual([]);
  });

  it("reports a cancelled upgrade as the result", () => {
    const { out, streams, formatter } = capture();
    expect(renderMigrationOutcome({ status: "cancelled", files: [file] }, streams, formatter)).toBe(
      true,
    );
    expect(JSON.parse(out.join("")).data).toEqual({
      upgraded: false,
      cancelled: true,
      files: [{ path: file.path, from: 1, to: 2 }],
      originalCommandExecuted: false,
    });
  });

  it("reports a completed upgrade and warns about each rollback copy left behind", () => {
    const { out, streams, formatter } = capture();
    expect(
      renderMigrationOutcome(
        { status: "upgraded", files: [file], retainedBackups: ["/b/left.bak"] },
        streams,
        formatter,
      ),
    ).toBe(true);
    const envelope = JSON.parse(out.join(""));
    expect(envelope.data).toEqual({
      upgraded: true,
      files: [file],
      originalCommandExecuted: false,
    });
    expect(envelope.meta.warnings).toEqual([
      {
        code: "backup_file_not_removed",
        message:
          "the upgrade is complete, but its temporary rollback copy could not be removed: /b/left.bak; delete that file yourself",
      },
    ]);
  });
});

describe("cliMigrationPrompt", () => {
  function deps(tty: boolean, hasPassword: boolean) {
    const { streams } = capture();
    return {
      streams,
      prompter: { isTTY: () => tty, select: vi.fn(async () => true) },
      secrets: {
        hasMasterPassword: () => hasPassword,
        primePassword: vi.fn(async () => {}),
        masterPassword: () => "hunter2",
      },
      keystore: { verifyPassword: () => true },
    };
  }

  it("is interactive only on a TTY", () => {
    expect(cliMigrationPrompt(deps(true, false) as never).interactive).toBe(true);
    expect(cliMigrationPrompt(deps(false, false) as never).interactive).toBe(false);
  });

  it("has no password source without stdin or a TTY", async () => {
    expect(await cliMigrationPrompt(deps(false, false) as never).password()).toBeNull();
  });

  it("verifies and returns a piped master password", async () => {
    const d = deps(false, true);
    expect(await cliMigrationPrompt(d as never).password()).toBe("hunter2");
    expect(d.secrets.primePassword).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "verify" }),
    );
  });
});
