/**
 * Wallet root commands — create/import/list/current/use/backup. Not chain-bound; no --network.
 * Calls WalletService rather than the transaction pipeline.
 */
import { z } from "zod";
import type { CommandDefinition } from "../contracts/index.js";
import { Schemas } from "../schemas/index.js";
import { CommandRegistry } from "../registry/index.js";
import { accountRef, ciEnum } from "../arity/index.js";
import type { LedgerDevice } from "../../../../application/ports/ledger-device.js";
import type { WalletService } from "../../../../application/use-cases/wallet-service.js";
import { resolveLedgerPath, selectLedgerPath } from "../../../../application/services/ledger-account.js";
import { ChainFamily, CHAIN_FAMILIES, FAMILIES } from "../../../../domain/family/index.js";
import { UsageError } from "../../../../domain/errors/index.js";
import { TextFormatters } from "../render/index.js";

// ── wallet import-ledger contract (module scope so it can be unit-tested) ───────
// The selectable Ledger apps are the families with a wired Ledger app (FAMILIES[f].ledger);
// the enum drives both --help and the interactive prompt.
const LEDGER_APP_BY_FAMILY: Partial<Record<ChainFamily, string>> = Object.fromEntries(
  CHAIN_FAMILIES.flatMap((f) => (FAMILIES[f].ledger ? [[f, FAMILIES[f].ledger!.app]] : [])),
);
const FAMILY_BY_LEDGER_APP: Record<string, ChainFamily> = Object.fromEntries(
  (Object.entries(LEDGER_APP_BY_FAMILY) as [ChainFamily, string][]).map(([f, app]) => [app, f]),
);
const LEDGER_APPS = CHAIN_FAMILIES
  .map((f) => LEDGER_APP_BY_FAMILY[f])
  .filter((a): a is string => a !== undefined) as [string, ...string[]];
export const walletImportLedgerFields = z.object({
  app: ciEnum(LEDGER_APPS).describe("Ledger app to open on the device, selecting the address-derivation scheme"),
  index: z.coerce.number().int().nonnegative().optional().describe("HD account index to import; omit with no --path/--address to use index 0; mutually exclusive with --path and --address"),
  path: z.string().optional().describe("explicit BIP32 derivation path, e.g. m/44'/195'/0'/0/0 for TRON; mutually exclusive with --index and --address"),
  address: z.string().optional().describe("known address to locate by bounded scan; mutually exclusive with --index and --path"),
  scanLimit: z.coerce.number().int().positive().optional().describe("number of account indexes to scan when using --address, in indexes; omit to scan 20 indexes"),
  label: Schemas.label().optional().describe("human-friendly unique account label, 1-64 chars; omit to auto-generate"),
});
/** --index / --path / --address are mutually exclusive (at most one locator). */
export const walletImportLedgerInput = walletImportLedgerFields.superRefine((v, c) => {
  const locators = [v.index !== undefined, v.path !== undefined, v.address !== undefined].filter(Boolean).length;
  if (locators > 1) c.addIssue({ code: "custom", path: ["index"], message: "--index, --path and --address are mutually exclusive" });
});

export function registerWalletCommands(
  reg: CommandRegistry,
  services: { walletService: WalletService; ledger: LedgerDevice },
): void {
  const wallets = services.walletService;
  const empty = z.object({});

  // ── create ───────────────────────────────────────────────────────────────
  const createFields = z.object({
    label: Schemas.label().optional().describe("human-friendly unique account label, 1-64 chars; omit to auto-generate"),
  });
  reg.add({
    path: ["create"], network: "none", wallet: "none", auth: "required", passwordMode: "establish",
    interactive: true, promptHints: { label: "default-label" },
    summary: "Create a new HD wallet (BIP39 seed)", fields: createFields, input: createFields,
    examples: [{ cmd: "wallet-cli create --label main" }],
    formatText: TextFormatters.walletCreated("Created", [
      "Recovery phrase is encrypted locally and was not printed.",
      "Run `backup` soon and store the file offline.",
    ]),
    run: async (_ctx, _net, input) => {
      return wallets.create(input.label);
    },
  } satisfies CommandDefinition);

  // ── import mnemonic ───────────────────────────────────────────────────────
  // BIP39 passphrase intentionally NOT exposed in phase 1 ; plumbing stays.
  const importMnemonicFields = z.object({ label: Schemas.label().optional().describe("human-friendly unique account label, 1-64 chars; omit to auto-generate; mnemonic comes from --mnemonic-stdin or interactive prompt") });
  reg.add({
    path: ["import", "mnemonic"], stdin: "mnemonic", network: "none", wallet: "none", auth: "required", passwordMode: "establish",
    interactive: true, promptHints: { label: "default-label" },
    summary: "Import a BIP39 mnemonic phrase", fields: importMnemonicFields, input: importMnemonicFields,
    examples: [{ cmd: "wallet-cli import mnemonic --label main" }],
    formatText: TextFormatters.walletCreated("Imported", [
      "Recovery phrase was read from hidden input and was not printed.",
    ]),
    run: async (ctx, _net, input) => {
      const secret = await ctx.secrets.resolveSecret("mnemonic");
      return wallets.importMnemonic(secret, input.label);
    },
  } satisfies CommandDefinition);

  // ── import private-key ────────────────────────────────────────────────────
  const importPrivateKeyFields = z.object({ label: Schemas.label().optional().describe("human-friendly unique account label, 1-64 chars; omit to auto-generate; private key comes from --private-key-stdin or interactive prompt") });
  reg.add({
    path: ["import", "private-key"], stdin: "privateKey", network: "none", wallet: "none", auth: "required", passwordMode: "establish",
    interactive: true, promptHints: { label: "default-label" },
    summary: "Import a raw private key", fields: importPrivateKeyFields, input: importPrivateKeyFields,
    examples: [{ cmd: "wallet-cli import private-key --label hot" }],
    formatText: TextFormatters.walletCreated("Imported", [
      "Private key was read from hidden input and was not printed.",
    ]),
    run: async (ctx, _net, input) => {
      const secret = await ctx.secrets.resolveSecret("privateKey");
      return wallets.importPrivateKey(secret, input.label);
    },
  } satisfies CommandDefinition);

  // ── import ledger ─────────────────────────────────────────────────────────
  reg.add({
    path: ["import", "ledger"], network: "none", wallet: "none", auth: "none",
    interactive: true, promptHints: { label: "default-label", index: "skip", path: "skip", address: "skip", scanLimit: "skip" },
    summary: "Register a Ledger account (watch-only; signs on device)", fields: walletImportLedgerFields, input: walletImportLedgerInput,
    examples: [{ cmd: "wallet-cli import ledger --app tron --index 0 --label cold" }],
    formatText: TextFormatters.walletLedger,
    run: async (ctx, _net, input) => {
      const family: ChainFamily = FAMILY_BY_LEDGER_APP[input.app]!;
      const hasLocator = input.index !== undefined || input.path !== undefined || input.address !== undefined;
      const path = hasLocator || !ctx.prompt.isTTY()
        ? await resolveLedgerPath(services.ledger, family, input)
        : await selectLedgerPath(services.ledger, family, ctx.prompt);
      ctx.emit({ type: "awaiting_device", reason: "verify_address" });
      return wallets.importLedger(family, path, input.label);
    },
  } satisfies CommandDefinition);

  // ── import watch ──────────────────────────────────────────────────────────
  const importWatchFields = z.object({
    address: z.string().min(1).describe("watch-only address to track; format: TRON base58 T...; family is auto-detected"),
    label: Schemas.label().optional().describe("human-friendly unique account label, 1-64 chars; omit to auto-generate"),
  });
  reg.add({
    path: ["import", "watch"], network: "none", wallet: "none", auth: "none",
    interactive: true,
    summary: "Register a watch-only address (no secret)", fields: importWatchFields, input: importWatchFields,
    examples: [{ cmd: "wallet-cli import watch --address T... --label team-vault" }],
    formatText: TextFormatters.walletWatch,
    run: async (_ctx, _net, input) => {
      return wallets.importWatch(input.address, input.label);
    },
  } satisfies CommandDefinition);

  // ── list ─────────────────────────────────────────────────────────────────
  reg.add({
    path: ["list"], network: "none", wallet: "none", auth: "none",
    summary: "List wallets/accounts (no unlock needed)", fields: empty, input: empty,
    examples: [{ cmd: "wallet-cli list --output json" }],
    formatText: TextFormatters.walletList,
    run: async () => wallets.list(),
  } satisfies CommandDefinition);

  // ── use ──────────────────────────────────────────────────────────────────
  const setActiveFields = z.object({ account: z.string().min(1).describe("accountId, label, or address to make active for future commands") });
  reg.add({
    path: ["use"], network: "none", wallet: "none", auth: "none", positionalAccount: true,
    summary: "Set the active account", fields: setActiveFields, input: setActiveFields,
    examples: [{ cmd: "wallet-cli use main" }],
    formatText: TextFormatters.walletUse,
    run: async (_ctx, _net, input) => {
      return wallets.use(input.account);
    },
  } satisfies CommandDefinition);

  // ── current ───────────────────────────────────────────────────────────────
  // Read-only: always reports the persisted active account; ignores --account
  // (use `use` to change it). wallet:"none" keeps help from
  // advertising an --account override here.
  reg.add({
    path: ["current"], network: "none", wallet: "none", auth: "none",
    summary: "Show the current active account", fields: empty, input: empty,
    examples: [{ cmd: "wallet-cli current" }],
    formatText: TextFormatters.walletCurrent,
    run: async () => wallets.current(),
  } satisfies CommandDefinition);

  // ── rename ────────────────────────────────────────────────────────────────
  const renameFields = z.object({
    account: z.string().min(1).describe("accountId, current label, or address to rename"),
    label: Schemas.label().describe("new unique label, 1-64 chars"),
  });
  reg.add({
    path: ["rename"], network: "none", wallet: "none", auth: "none", positionalAccount: true,
    summary: "Rename an account label", fields: renameFields, input: renameFields,
    examples: [{ cmd: "wallet-cli rename main --label primary" }],
    formatText: TextFormatters.walletRename,
    run: async (_ctx, _net, input) => {
      return wallets.rename(input.account, input.label);
    },
  } satisfies CommandDefinition);

  // ── derive ────────────────────────────────────────────────────────────────
  const addAccountFields = z.object({
    account: z.string().min(1).describe("seed wallet accountId, label, or address to derive from"),
    index: z.coerce.number().int().nonnegative().optional().describe("explicit HD account index, in account index; omit to use the next free index"),
    label: Schemas.label().optional().describe("label for the new derived account, 1-64 chars; omit to auto-generate"),
  });
  reg.add({
    path: ["derive"], network: "none", wallet: "none", auth: "required",
    summary: "Derive an HD account in a seed wallet (next free, or --index)", fields: addAccountFields, input: addAccountFields,
    examples: [{ cmd: "wallet-cli derive --account main --index 3" }],
    formatText: TextFormatters.walletDerive,
    run: async (_ctx, _net, input) => {
      return wallets.derive(input.account, input.index, input.label);
    },
  } satisfies CommandDefinition);

  // ── delete ────────────────────────────────────────────────────────────────
  const deleteFields = z.object({
    account: accountRef("account or wallet to delete, addressed by accountId, label, or address"),
    yes: z.boolean().default(false).describe("skip the interactive confirmation; required for non-TTY deletion"),
  });
  reg.add({
    path: ["delete"], network: "none", wallet: "none", auth: "none", interactive: true, positionalAccount: true,
    summary: "Delete a wallet/account and clean orphan labels", fields: deleteFields, input: deleteFields,
    examples: [{ cmd: "wallet-cli delete old --yes" }],
    formatText: TextFormatters.walletDelete,
    run: async (ctx, _net, input) => {
      if (!input.yes) {
        if (!ctx.prompt.isTTY()) {
          throw new UsageError("tty_required", "deletion needs confirmation: pass --yes or run in a terminal");
        }
        const d = wallets.describe(input.account);
        const expect = d.label ?? d.accountId;
        const kind = d.label ? "label" : "ref";
        const ok = await ctx.prompt.confirm({ label: `Delete ${expect}? Type the exact ${kind} to confirm`, expect });
        if (!ok) throw new UsageError("aborted", "deletion not confirmed");
      }
      return wallets.delete(input.account);
    },
  } satisfies CommandDefinition);

  // ── backup ────────────────────────────────────────────────────────────────
  // Writes the secret + metadata to a 0600 FILE (never stdout/envelope): the secret stays off
  // screen, logs and AI context. stdout returns only metadata + the written path.
  // master password via dispatch prime (passwordMode: "verify"); --password-stdin is the non-interactive source.
  const backupFields = z.object({
    account: accountRef("account or wallet to export, addressed by accountId, label, or address"),
    out: z.string().optional().describe("output file path; omit to write <wallet-cli-root>/backups/<accountId>-<timestamp>.json; file is created with mode 0600 and never overwritten"),
  });
  reg.add({
    path: ["backup"], network: "none", wallet: "none", auth: "required", passwordMode: "verify", interactive: true, positionalAccount: true,
    summary: "Export an account's secret + metadata to a 0600 file", fields: backupFields, input: backupFields,
    examples: [{ cmd: "wallet-cli backup main --out ~/main-backup.json --password-stdin" }],
    formatText: TextFormatters.walletBackup,
    run: async (_ctx, _net, input) => wallets.backup(input.account, input.out),
  } satisfies CommandDefinition);
}
