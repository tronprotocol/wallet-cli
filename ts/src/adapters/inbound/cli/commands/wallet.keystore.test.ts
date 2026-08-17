/**
 * The `backup` mode switch and `import keystore`, exercised through real dispatch — the parts that
 * only exist there: which envelope `command` a mode reports, whether a password is demanded, whether
 * the TTY is asked to pick an account, and the flag combinations each mode refuses.
 */
import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCli, type ShellOptions } from "../shell/index.js";
import { CommandRegistry } from "../registry/index.js";
import { CapabilityRegistry } from "../../../../application/services/capability/index.js";
import { TargetResolver } from "../../../../application/services/target/index.js";
import { StreamManager } from "../stream/index.js";
import { createOutputFormatter } from "../output/index.js";
import { ConfigLoader, NetworkRegistry } from "../../../outbound/config/index.js";
import { AtomicFileStore } from "../../../outbound/persistence/fs/index.js";
import { Keystore } from "../../../outbound/keystore/index.js";
import { SecretResolver } from "../input/secret/index.js";
import { Prompter } from "../input/prompt/index.js";
import { WalletService } from "../../../../application/use-cases/wallet-service.js";
import type { BackupRecord } from "../../../../application/ports/backup-records.js";
import { KeystoreV3 } from "../../../../domain/keystore/index.js";
import { registerWalletCommands } from "./wallet.js";
import type { SessionRef } from "../contracts/index.js";

// Cheap KDF for keystore encryption in this suite — see cheap-scrypt.ts. Production untouched.
vi.mock(
  "@noble/hashes/scrypt.js",
  async () => import("../../../outbound/persistence/crypto/__test-support__/cheap-scrypt.js"),
);

const VALID_MNEMONIC = "test test test test test test test test test test test junk";
const VALID_PASSWORD = "Abcdef1!";
const RAW_KEY = "4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d";
const KEYSTORE_PW = "keystore-file-pw";

const record = (over: Partial<BackupRecord> = {}): BackupRecord => ({
  operation: "backup",
  accountId: "wlt_seeded.0",
  account: "TSeeded",
  label: "seeded",
  out: "./seeded.json",
  timestamp: "2026-08-05T11:40:00Z",
  ...over,
});

function fixture(opts: { tty: boolean; records?: BackupRecord[] }) {
  const root = mkdtempSync(join(tmpdir(), "wallet-keystore-test-"));
  const store = new AtomicFileStore();
  const streams = new StreamManager("json", false);
  const emitted: string[] = [];
  const asked: string[] = [];
  const prompter = new Prompter({
    isTTY: () => opts.tty,
    async question(prompt: string, _hidden: boolean) {
      asked.push(prompt);
      // the keystore file's own password is a distinct prompt from the master password
      return /keystore/i.test(prompt) ? KEYSTORE_PW : VALID_PASSWORD;
    },
    async readKey() {
      return { name: "return" };
    },
    write() {},
    beginRaw() {},
    endRaw() {},
  });
  const secrets = new SecretResolver(streams, {}, prompter);
  const keystore = new Keystore(root, store, () => secrets.masterPassword());
  const spyPrime = vi.spyOn(secrets, "primePassword");
  const spySelect = vi.spyOn(prompter, "select");

  const config = ConfigLoader.load();
  const networkRegistry = new NetworkRegistry(config);
  const formatter = createOutputFormatter("json", streams, Date.now());
  vi.spyOn(streams, "result").mockImplementation((line: string) => void emitted.push(line));

  const writes: Array<{ out: string; payload: unknown }> = [];
  const registry = new CommandRegistry();
  registerWalletCommands(registry, {
    walletService: new WalletService(
      keystore,
      {} as any,
      {
        write: (accountId: string, requested: string | undefined, payload: unknown) => {
          const out = requested ?? `./${accountId}-1700000000000.json`;
          writes.push({ out, payload });
          return { out, fileMode: "0600" as const, bytes: 491 };
        },
      },
      { append: () => {}, list: () => opts.records ?? [] },
    ),
    ledger: {} as any,
  } as any);

  const session: SessionRef = {};
  const shellOpts: ShellOptions = {
    registry,
    globals: { output: "json", verbose: false },
    deps: { config, networkRegistry, streams, secrets, keystore, prompter, formatter },
    targetResolver: new TargetResolver({ networkRegistry, keystore }),
    caps: new CapabilityRegistry(),
    streams,
    formatter,
    session,
  };
  const envelope = () => JSON.parse(emitted.at(-1)!);
  return { shellOpts, keystore, secrets, spyPrime, spySelect, root, asked, writes, envelope };
}

/** an account whose secret can be exported, with the master password already established. */
async function seedWallet(
  f: ReturnType<typeof fixture>,
  secret = VALID_MNEMONIC,
  type: "seed" | "privateKey" = "seed",
) {
  await f.secrets.primePassword({ mode: "set" });
  const { accountId } = f.keystore.import({ secret, type, label: "main" });
  f.secrets.clearPrimed();
  f.spyPrime.mockClear();
  f.spySelect.mockClear();
  return accountId;
}

describe("backup --keystore", () => {
  it("writes a V3 keystore the master password opens, and reports command 'backup'", async () => {
    const f = fixture({ tty: true });
    const accountId = await seedWallet(f, RAW_KEY, "privateKey");

    await buildCli(f.shellOpts).parseAsync(["backup", accountId, "--keystore"]);

    const env = f.envelope();
    expect(env.command).toBe("backup");
    expect(env.data).toMatchObject({
      accountId,
      format: "keystore",
      secretType: "privateKey",
      fileMode: "0600",
    });
    expect(KeystoreV3.decrypt(f.writes[0]!.payload, VALID_PASSWORD)).toHaveLength(32);
  });

  it("still verifies the master password", async () => {
    const f = fixture({ tty: true });
    const accountId = await seedWallet(f);
    await buildCli(f.shellOpts).parseAsync(["backup", accountId, "--keystore"]);
    expect(f.spyPrime).toHaveBeenCalledOnce();
    expect(f.spyPrime.mock.calls[0]![0].mode).toBe("verify");
  });

  it("honours an explicit --out path", async () => {
    const f = fixture({ tty: true });
    const accountId = await seedWallet(f);
    await buildCli(f.shellOpts).parseAsync([
      "backup",
      accountId,
      "--keystore",
      "--out",
      "./main.keystore.json",
    ]);
    expect(f.envelope().data.out).toBe("./main.keystore.json");
  });
});

describe("backup --records", () => {
  it("reports the distinct command id 'backup.records' — the data shape differs", async () => {
    const f = fixture({ tty: false, records: [record()] });
    await buildCli(f.shellOpts).parseAsync(["backup", "--records"]);
    expect(f.envelope().command).toBe("backup.records");
  });

  it("demands no master password and exports nothing", async () => {
    const f = fixture({ tty: false, records: [record()] });
    await buildCli(f.shellOpts).parseAsync(["backup", "--records"]);
    expect(f.spyPrime).not.toHaveBeenCalled();
    expect(f.writes).toEqual([]);
  });

  it("does not ask a TTY user to pick an account — nothing is being exported", async () => {
    const f = fixture({ tty: true, records: [record()] });
    await seedWallet(f);
    await buildCli(f.shellOpts).parseAsync(["backup", "--records"]);
    expect(f.spySelect).not.toHaveBeenCalled();
    expect(f.envelope().command).toBe("backup.records");
  });

  // The service returns `pagination` inside its view; the json formatter lifts it into envelope
  // `meta` (and removes it from `data`) whenever it carries a full offset/limit/total triple.
  it("returns records, with pagination lifted into envelope meta", async () => {
    const f = fixture({
      tty: false,
      records: [record({ out: "./1.json" }), record({ out: "./2.json" })],
    });
    await buildCli(f.shellOpts).parseAsync(["backup", "--records", "--limit", "1"]);
    const env = f.envelope();
    expect(env.data.records.map((r: BackupRecord) => r.out)).toEqual(["./1.json"]);
    expect(env.meta.pagination).toEqual({ offset: 0, limit: 1, total: 2 });
    expect(env.data.pagination).toBeUndefined();
  });

  it("rejects export flags, which it could only ignore", async () => {
    const f = fixture({ tty: false, records: [] });
    for (const argv of [
      ["backup", "--records", "--keystore"],
      ["backup", "--records", "--out", "./x.json"],
    ]) {
      await expect(buildCli(f.shellOpts).parseAsync(argv)).rejects.toMatchObject({
        code: "invalid_value",
      });
    }
  });

  it("rejects record filters when not in records mode", async () => {
    const f = fixture({ tty: false });
    await expect(
      buildCli(f.shellOpts).parseAsync(["backup", "main", "--from", "2026-08-01"]),
    ).rejects.toMatchObject({ code: "invalid_value" });
  });

  it.each([
    ["a malformed shape", "01-08-2026"],
    ["an impossible calendar date", "2026-02-31"],
    ["an impossible time", "2026-08-01 25:00:00"],
    ["a local-time offset", "2026-08-01T00:00:00+08:00"],
  ])("rejects %s in --from", async (_label, value) => {
    const f = fixture({ tty: false, records: [] });
    await expect(
      buildCli(f.shellOpts).parseAsync(["backup", "--records", "--from", value]),
    ).rejects.toMatchObject({ code: "invalid_value" });
  });

  it("accepts both accepted time spellings", async () => {
    const f = fixture({ tty: false, records: [record()] });
    for (const value of ["2026-08-01", "2026-08-01 09:30:00"]) {
      await buildCli(f.shellOpts).parseAsync(["backup", "--records", "--from", value]);
      expect(f.envelope().success).toBe(true);
    }
  });

  it("requires an account when NOT in records mode and no TTY can be asked", async () => {
    const f = fixture({ tty: false });
    await expect(buildCli(f.shellOpts).parseAsync(["backup"])).rejects.toMatchObject({
      code: "invalid_value",
    });
  });
});

describe("import keystore", () => {
  function keystoreFile(
    root: string,
    name = "export.json",
    keyHex = RAW_KEY,
    password = KEYSTORE_PW,
  ) {
    const path = join(root, name);
    writeFileSync(
      path,
      JSON.stringify(
        KeystoreV3.encrypt(Buffer.from(keyHex, "hex"), password, `41${"00".repeat(20)}`),
      ),
    );
    return path;
  }

  it("imports the file's key, reporting command 'import.keystore'", async () => {
    const f = fixture({ tty: true });
    const path = keystoreFile(f.root);

    await buildCli(f.shellOpts).parseAsync(["import", "keystore", path, "--label", "imported"]);

    const env = f.envelope();
    expect(env.command).toBe("import.keystore");
    expect(env.data).toMatchObject({
      status: "created",
      label: "imported",
      type: "privateKey",
      index: null,
      active: true,
    });
  });

  it("asks for the master password and the keystore's own password, separately", async () => {
    const f = fixture({ tty: true });
    await buildCli(f.shellOpts).parseAsync(["import", "keystore", keystoreFile(f.root)]);
    expect(f.asked.some((p) => /keystore file password/i.test(p))).toBe(true);
    expect(f.spyPrime).toHaveBeenCalled();
  });

  it("refuses to run without a TTY — both passwords are hidden-input only", async () => {
    const f = fixture({ tty: false });
    await expect(
      buildCli(f.shellOpts).parseAsync(["import", "keystore", keystoreFile(f.root)]),
    ).rejects.toMatchObject({ code: "tty_required" });
  });

  it("reports a missing file distinctly from a malformed one, before asking for any password", async () => {
    const f = fixture({ tty: true });
    await expect(
      buildCli(f.shellOpts).parseAsync(["import", "keystore", join(f.root, "nope.json")]),
    ).rejects.toMatchObject({ code: "keystore_not_found" });
    expect(f.spyPrime).not.toHaveBeenCalled();

    const bad = join(f.root, "bad.json");
    writeFileSync(bad, "{not json");
    await expect(
      buildCli(f.shellOpts).parseAsync(["import", "keystore", bad]),
    ).rejects.toMatchObject({ code: "invalid_keystore" });
  });

  it("rejects a version-1 blob of ours as not a keystore", async () => {
    const f = fixture({ tty: true });
    const path = join(f.root, "vault.json");
    const { crypto } = KeystoreV3.encrypt(
      Buffer.from(RAW_KEY, "hex"),
      KEYSTORE_PW,
      `41${"00".repeat(20)}`,
    );
    writeFileSync(path, JSON.stringify({ version: 1, type: "raw-privkey", id: "key_x", crypto }));
    await expect(
      buildCli(f.shellOpts).parseAsync(["import", "keystore", path]),
    ).rejects.toMatchObject({ code: "invalid_keystore" });
  });

  it("refuses a same-address account with account_exists", async () => {
    const f = fixture({ tty: true });
    await seedWallet(f, RAW_KEY, "privateKey");
    await expect(
      buildCli(f.shellOpts).parseAsync(["import", "keystore", keystoreFile(f.root)]),
    ).rejects.toMatchObject({ code: "account_exists" });
  });
});
