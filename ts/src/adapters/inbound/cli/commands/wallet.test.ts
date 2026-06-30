import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { Keystore } from "../../../outbound/keystore/index.js";
import { AtomicFileStore } from "../../../outbound/persistence/fs/index.js";
import { SecretResolver } from "../input/secret/index.js";
import { StreamManager } from "../stream/index.js";
import { Prompter } from "../input/prompt/index.js";
import { ConfigLoader, NetworkRegistry } from "../../../outbound/config/index.js";
import { buildExecutionContext, RuntimeDeps } from "../context/index.js";
import { createOutputFormatter } from "../output/index.js";
import { registerWalletCommands, walletImportLedgerFields, walletImportLedgerInput } from "./wallet.js";
import { CommandRegistry } from "../registry/index.js";
import { commandId } from "../command-id.js";
import type { Globals } from "../contracts/index.js";
import { Derivation } from "../../../../domain/derivation/index.js";
import { WalletService } from "../../../../application/use-cases/wallet-service.js";

// ── test constants ─────────────────────────────────────────────────────────────
const VALID_MNEMONIC = "test test test test test test test test test test test junk";
const VALID_PRIVATE_KEY = "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const VALID_PASSWORD = "Abcdef1!";

// ── helpers ────────────────────────────────────────────────────────────────────

interface FakePromptOpts {
  tty?: boolean;
  hiddenAnswers?: string[];
  confirmResult?: boolean;
  confirmAnswer?: string;
}

function makeFakeBackend(opts: FakePromptOpts = {}): ConstructorParameters<typeof Prompter>[0] {
  const { tty = true, hiddenAnswers = [], confirmResult = true, confirmAnswer } = opts;
  let hiddenIdx = 0;

  return {
    isTTY: () => tty,
    async question(_prompt: string, hidden: boolean) {
      if (hidden) {
        return hiddenAnswers[hiddenIdx++] ?? VALID_PASSWORD;
      }
      // confirm prompts are not hidden
      return confirmAnswer ?? "";
    },
    async readKey() { return { name: "return" }; },
    write(_s: string) {},
    beginRaw() {},
    endRaw() {},
  };
}

function buildTestDeps(opts: FakePromptOpts & { root?: string } = {}): {
  deps: RuntimeDeps;
  ks: Keystore;
  prompter: Prompter;
  streams: StreamManager;
  secrets: SecretResolver;
} {
  const root = opts.root ?? mkdtempSync(join(tmpdir(), "wallet-test-"));
  const store = new AtomicFileStore();
  const streams = new StreamManager("text", false);
  const prompter = new Prompter(makeFakeBackend(opts));
  // password: "-" means "read from stdin"; we prime the stdin via streams
  // Actually: use no paths for password, rely on primePassword via prompter
  const secrets = new SecretResolver(streams, {}, prompter);
  const ks = new Keystore(root, store, () => secrets.masterPassword());
  const config = ConfigLoader.load();
  const networkRegistry = new NetworkRegistry(config);
  const formatter = createOutputFormatter("text", streams, Date.now());
  const deps: RuntimeDeps = { config, networkRegistry, streams, secrets, keystore: ks, prompter, formatter };
  return { deps, ks, prompter, streams, secrets };
}

function buildGlobals(): Globals {
  return { output: "text", verbose: false };
}

function buildServices(ks: Keystore) {
  const ledger = {} as any;
  return {
    walletService: new WalletService(ks, ledger, {
      write: () => ({ out: "unused", fileMode: "0600", bytes: 0 }),
    }),
    ledger,
    tokenBook: {} as any,
    priceProvider: {} as any,
    rpc: {} as any,
    signerResolver: {} as any,
    txPipeline: {} as any,
    capabilityRegistry: {} as any,
  };
}

/** Resolve a command by its derived canonical id (e.g. "create", "import.mnemonic"). */
function getCmd(registry: CommandRegistry, id: string): ReturnType<CommandRegistry["resolveNeutral"]> {
  const cmd = registry.all().find((c) => commandId(c) === id) ?? null;
  if (!cmd) throw new Error(`command not found: ${id}`);
  return cmd;
}

async function runCmd(
  cmdId: string,
  input: Record<string, unknown>,
  opts: FakePromptOpts & { root?: string } = {},
) {
  const { deps, ks } = buildTestDeps(opts);
  // Prime the password before command runs (simulating what dispatch does for passwordMode)
  await deps.secrets.primePassword({ mode: "set" });
  const ctx = buildExecutionContext(buildGlobals(), deps);
  const registry = new CommandRegistry();
  registerWalletCommands(registry, buildServices(ks));
  const cmd = getCmd(registry, cmdId)!;
  const result = await cmd.run(ctx, undefined as any, input as any);
  return { result, ks };
}

// ── wallet create ──────────────────────────────────────────────────────────────

describe("wallet create", () => {
  it("creates an account with a tron address", async () => {
    const { result, ks } = await runCmd("create", {}, {
      tty: true,
      hiddenAnswers: [VALID_PASSWORD, VALID_PASSWORD],
    });
    expect(result).toBeDefined();
    expect(result.accountId).toMatch(/^wlt_/);
    expect(result.addresses?.tron?.startsWith("T")).toBe(true);
    const accounts = ks.list();
    expect(accounts).toHaveLength(1);
  });

  it("createFields schema does NOT have a words key", async () => {
    // We verify the schema at runtime by checking the registered command's fields
    const { deps, ks } = buildTestDeps({ tty: true, hiddenAnswers: [VALID_PASSWORD, VALID_PASSWORD] });
    const registry = new CommandRegistry();
    registerWalletCommands(registry, buildServices(ks));
    const cmd = getCmd(registry, "create")!;
    const shape = (cmd.fields as any).shape as Record<string, unknown>;
    expect(Object.keys(shape)).not.toContain("words");
    expect(Object.keys(shape)).toContain("label");
  });

  it("generates a 12-word mnemonic", async () => {
    // create, then backup to read mnemonic word count
    const root = mkdtempSync(join(tmpdir(), "wallet-create-test-"));
    const { deps, ks, secrets } = buildTestDeps({
      root,
      tty: true,
      hiddenAnswers: [VALID_PASSWORD, VALID_PASSWORD],
    });
    // prime password for create
    await secrets.primePassword({ mode: "set" });
    const ctx = buildExecutionContext(buildGlobals(), deps);
    const registry = new CommandRegistry();
    registerWalletCommands(registry, buildServices(ks));

    const createCmd = getCmd(registry, "create")!;
    const createResult = await createCmd.run(ctx, undefined as any, {} as any);

    // verify the created account has a seed source
    const accountList = ks.list();
    expect(accountList).toHaveLength(1);
    const wallet = ks.resolveAccount(createResult.accountId).wallet;
    expect(wallet.source.type).toBe("seed");

    // reveal the mnemonic to check word count
    const vaultId = (wallet.source as any).vaultId as string;
    const revealed = ks.revealMnemonic(vaultId);
    const words = revealed.mnemonic.split(" ").filter(Boolean);
    expect(words).toHaveLength(12);
  });
});

// ── wallet import-mnemonic ─────────────────────────────────────────────────────

describe("wallet import-mnemonic", () => {
  it("creates an account from a mnemonic provided via interactive prompt", async () => {
    const root = mkdtempSync(join(tmpdir(), "wallet-import-mnemonic-test-"));
    const { deps, ks, secrets } = buildTestDeps({
      root,
      tty: true,
      // order: set password, confirm password, then mnemonic
      hiddenAnswers: [VALID_PASSWORD, VALID_PASSWORD, VALID_MNEMONIC],
    });

    await secrets.primePassword({ mode: "set" });
    const ctx = buildExecutionContext(buildGlobals(), deps);
    const registry = new CommandRegistry();
    registerWalletCommands(registry, buildServices(ks));

    const cmd = getCmd(registry, "import.mnemonic")!;
    const result = await cmd.run(ctx, undefined as any, {} as any);

    expect(result.accountId).toMatch(/^wlt_/);
    expect(result.addresses?.tron?.startsWith("T")).toBe(true);
    expect(ks.list()).toHaveLength(1);
  });
});

// ── wallet import-private-key ──────────────────────────────────────────────────

describe("wallet import-private-key", () => {
  it("creates an account from a private key provided via interactive prompt", async () => {
    const root = mkdtempSync(join(tmpdir(), "wallet-import-pk-test-"));
    const { deps, ks, secrets } = buildTestDeps({
      root,
      tty: true,
      // order: set password, confirm password, then private key
      hiddenAnswers: [VALID_PASSWORD, VALID_PASSWORD, VALID_PRIVATE_KEY],
    });

    await secrets.primePassword({ mode: "set" });
    const ctx = buildExecutionContext(buildGlobals(), deps);
    const registry = new CommandRegistry();
    registerWalletCommands(registry, buildServices(ks));

    const cmd = getCmd(registry, "import.private-key")!;
    const result = await cmd.run(ctx, undefined as any, {} as any);

    expect(result.accountId).toMatch(/^wlt_/);
    expect(result.addresses?.tron?.startsWith("T")).toBe(true);
    expect(ks.list()).toHaveLength(1);
  });
});

// ── wallet delete ─────────────────────────────────────────────────────────────

describe("wallet delete", () => {
  async function setupAccountForDelete(root: string, opts: FakePromptOpts) {
    const { deps, ks, secrets } = buildTestDeps({ root, ...opts });
    await secrets.primePassword({ mode: "set" });
    const ctx = buildExecutionContext(buildGlobals(), deps);
    const registry = new CommandRegistry();
    registerWalletCommands(registry, buildServices(ks));

    // import an account first
    const importCmd = getCmd(registry, "import.mnemonic")!;
    const importResult = await importCmd.run(ctx, undefined as any, {} as any);
    return { ctx, registry, ks, accountId: importResult.accountId };
  }

  it("deletes an account when --yes is true", async () => {
    const root = mkdtempSync(join(tmpdir(), "wallet-delete-test-"));
    // hiddenAnswers for set+confirm password, then mnemonic for import
    const { ctx, registry, ks, accountId } = await setupAccountForDelete(root, {
      tty: true,
      hiddenAnswers: [VALID_PASSWORD, VALID_PASSWORD, VALID_MNEMONIC],
    });

    expect(ks.list()).toHaveLength(1);

    const deleteCmd = getCmd(registry, "delete")!;
    await deleteCmd.run(ctx, undefined as any, { account: accountId, yes: true } as any);

    expect(ks.list()).toHaveLength(0);
  });

  it("confirms deletion by exact label when a label is available", async () => {
    const root = mkdtempSync(join(tmpdir(), "wallet-delete-label-test-"));
    const { ctx, registry, ks, accountId } = await setupAccountForDelete(root, {
      tty: true,
      hiddenAnswers: [VALID_PASSWORD, VALID_PASSWORD, VALID_MNEMONIC],
      confirmAnswer: "wallet-1",
    });

    expect(ks.describe(accountId).label).toBe("wallet-1");

    const deleteCmd = getCmd(registry, "delete")!;
    await deleteCmd.run(ctx, undefined as any, { account: accountId } as any);

    expect(ks.list()).toHaveLength(0);
  });

  it("throws aborted when --yes is false and confirm returns wrong string", async () => {
    const root = mkdtempSync(join(tmpdir(), "wallet-delete-abort-test-"));
    const { ctx, registry, ks, accountId } = await setupAccountForDelete(root, {
      tty: true,
      hiddenAnswers: [VALID_PASSWORD, VALID_PASSWORD, VALID_MNEMONIC],
      confirmAnswer: "wrong-ref",
    });

    expect(ks.list()).toHaveLength(1);

    const deleteCmd = getCmd(registry, "delete")!;
    await expect(
      deleteCmd.run(ctx, undefined as any, { account: accountId } as any),
    ).rejects.toMatchObject({ code: "aborted" });

    // account should still exist
    expect(ks.list()).toHaveLength(1);
  });

  it("throws tty_required when --yes is omitted and not a TTY", async () => {
    const root = mkdtempSync(join(tmpdir(), "wallet-delete-notty-test-"));
    const { deps, ks, secrets } = buildTestDeps({
      root,
      tty: false,
    });
    // for non-TTY, secrets need password via stdin path
    const storeNonTty = new AtomicFileStore();
    // Use a separate TTY keystore just to create the account
    const root2 = mkdtempSync(join(tmpdir(), "wallet-delete-notty2-test-"));
    const streams2 = new StreamManager("text", false);
    const fakeBackend2 = {
      isTTY: () => true,
      async question(_p: string, hidden: boolean) { return VALID_PASSWORD; },
      async readKey() { return { name: "return" }; },
      write(_s: string) {},
      beginRaw() {},
      endRaw() {},
    };
    const prompter2 = new Prompter(fakeBackend2);
    const secrets2 = new SecretResolver(streams2, {}, prompter2);
    const ks2 = new Keystore(root2, storeNonTty, () => secrets2.masterPassword());
    await secrets2.primePassword({ mode: "set" });
    const { accountId } = ks2.import({ secret: VALID_MNEMONIC, type: "seed" });

    // Now set up a non-TTY context pointing to the same root
    const storeNonTty2 = new AtomicFileStore();
    const streamsNT = new StreamManager("text", false);
    const fakeBackendNT = {
      isTTY: () => false,
      async question(_p: string, _hidden: boolean) { return ""; },
      async readKey() { return { name: "return" }; },
      write(_s: string) {},
      beginRaw() {},
      endRaw() {},
    };
    const prompterNT = new Prompter(fakeBackendNT);
    // prime password via stdin path by priming it directly
    const secretsNT = new SecretResolver(streamsNT, {}, prompterNT);
    // manually prime the password so ks.delete can proceed if needed
    // Actually we just need the delete to fail at the TTY check, before touching ks
    const ksNT = new Keystore(root2, storeNonTty2, () => secrets2.masterPassword());

    const config = ConfigLoader.load();
    const networkRegistry = new NetworkRegistry(config);
    const formatter = createOutputFormatter("text", streamsNT, Date.now());
    const depsNT: RuntimeDeps = {
      config, networkRegistry, streams: streamsNT, secrets: secretsNT,
      keystore: ksNT, prompter: prompterNT, formatter,
    };
    const ctxNT = buildExecutionContext(buildGlobals(), depsNT);
    const registryNT = new CommandRegistry();
    registerWalletCommands(registryNT, buildServices(ksNT));

    const deleteCmd = getCmd(registryNT, "delete")!;
    await expect(
      deleteCmd.run(ctxNT, undefined as any, { account: accountId } as any),
    ).rejects.toMatchObject({ code: "tty_required" });
  });
});
