/**
 * Wallet command group (L4) — create/import/list/active/backup… Not chain-bound, no --network.
 * Uses Keystore/Ledger directly, not TxPipeline. (plan §3 L4 中立命令群組 / §7.11)
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { ChainFamily, CommandDefinition } from "../core/types/index.js";
import { Schemas } from "../infra/contract/index.js";
import { CommandRegistry } from "../runtime/registry/index.js";
import { accountRef } from "../runtime/adapter/index.js";
import type { Services } from "./services.js";
import { Derivation } from "../core/derivation/index.js";
import { resolveLedgerPath, interactiveLedgerSelect } from "../infra/ledger/index.js";
import { ConfigLoader } from "../infra/config/index.js";
import { familyOf } from "../core/family/index.js";
import { UsageError, WalletError } from "../core/errors/index.js";

/** dedup/idempotency disclosure: did the mutator create a new account or hit an existing one? */
const statusOf = (created: boolean): "created" | "existing" => (created ? "created" : "existing");

/** `wallet backup` output path: explicit --out, else <root>/backups/<accountId>-<ts>.json. */
function backupOutPath(out: string | undefined, ref: string): string {
  if (out) return resolve(out);
  return join(ConfigLoader.resolveRoot(), "backups", `${ref}-${Date.now()}.json`);
}

/** Write the backup (incl. plaintext secret) to a fresh 0600 file; never clobber an existing one.
 *  Returns the byte length written (disclosed in the envelope; the secret itself never is). */
function writeBackupFile(path: string, data: unknown): number {
  if (existsSync(path)) throw new UsageError("output_exists", `refusing to overwrite existing file: ${path}`);
  mkdirSync(dirname(path), { recursive: true });
  const content = JSON.stringify(data, null, 2) + "\n";
  writeFileSync(path, content, { mode: 0o600 });
  return Buffer.byteLength(content);
}

// ── wallet import-ledger contract (module scope so it can be unit-tested) ───────
export const walletImportLedgerFields = z.object({
  app: z.enum(["tron", "ethereum"]).describe("Ledger app to open on the device, selecting TRON or EVM address derivation"),
  index: z.coerce.number().int().nonnegative().optional().describe("HD account index to import; omit with no --path/--address to use index 0; mutually exclusive with --path and --address"),
  path: z.string().optional().describe("explicit BIP32 derivation path, e.g. m/44'/195'/0'/0/0 for TRON or m/44'/60'/0'/0/0 for Ethereum; mutually exclusive with --index and --address"),
  address: z.string().optional().describe("known address to locate by bounded scan; mutually exclusive with --index and --path"),
  scanLimit: z.coerce.number().int().positive().optional().describe("number of account indexes to scan when using --address, in indexes; omit to scan 20 indexes"),
  label: Schemas.label().optional().describe("human-friendly unique account label, 1-64 chars; omit to auto-generate"),
});
/** --index / --path / --address are mutually exclusive (at most one locator). */
export const walletImportLedgerInput = walletImportLedgerFields.superRefine((v, c) => {
  const locators = [v.index !== undefined, v.path !== undefined, v.address !== undefined].filter(Boolean).length;
  if (locators > 1) c.addIssue({ code: "custom", path: ["index"], message: "--index, --path and --address are mutually exclusive" });
});

/** infer the chain family of a watch address from its on-chain encoding (T… / 0x…). */
function detectWatchFamily(address: string): ChainFamily {
  const family = familyOf(address);
  if (!family) throw new UsageError("invalid_option", `unrecognised address format: ${address}`);
  return family;
}

export function registerWalletCommands(reg: CommandRegistry, services: Services): void {
  const ks = services.keystore;
  const empty = z.object({});

  // ── wallet create ────────────────────────────────────────────────────────
  const createFields = z.object({
    label: Schemas.label().optional().describe("human-friendly unique account label, 1-64 chars; omit to auto-generate"),
  });
  reg.add({
    id: "wallet.create", path: ["create"], network: "none", wallet: "none", auth: "required", passwordMode: "establish",
    summary: "create a new HD wallet (BIP39 seed)", fields: createFields, input: createFields,
    examples: [{ cmd: "wallet-cli wallet create --label main" }],
    run: async (_ctx, _net, input) => {
      const mnemonic = Derivation.generateMnemonic(128); // fixed 12-word seed
      // recovery phrase is never printed: it's stored encrypted and retrievable via `wallet backup`.
      const { accountId, created } = ks.import({ secret: mnemonic, type: "seed", label: input.label });
      return { status: statusOf(created), ...ks.describe(accountId) };
    },
  } satisfies CommandDefinition);

  // ── wallet import-mnemonic ─────────────────────────────────────────────────
  // BIP39 passphrase intentionally NOT exposed in phase 1 (§7.14.3); plumbing stays.
  const importMnemonicFields = z.object({ label: Schemas.label().optional().describe("human-friendly unique account label, 1-64 chars; omit to auto-generate; mnemonic comes from --mnemonic-stdin or interactive prompt") });
  reg.add({
    id: "wallet.import-mnemonic", path: ["import-mnemonic"], network: "none", wallet: "none", auth: "required", passwordMode: "establish",
    summary: "import an existing BIP39 mnemonic (encrypted at rest)", fields: importMnemonicFields, input: importMnemonicFields,
    examples: [{ cmd: "wallet-cli wallet import-mnemonic --label main" }],
    run: async (ctx, _net, input) => {
      const secret = await ctx.secrets.resolveSecret("mnemonic");
      const { accountId, created } = ks.import({ secret, type: "seed", label: input.label });
      return { status: statusOf(created), ...ks.describe(accountId) };
    },
  } satisfies CommandDefinition);

  // ── wallet import-private-key ──────────────────────────────────────────────
  const importPrivateKeyFields = z.object({ label: Schemas.label().optional().describe("human-friendly unique account label, 1-64 chars; omit to auto-generate; private key comes from --private-key-stdin or interactive prompt") });
  reg.add({
    id: "wallet.import-private-key", path: ["import-private-key"], network: "none", wallet: "none", auth: "required", passwordMode: "establish",
    summary: "import an existing private key (encrypted at rest)", fields: importPrivateKeyFields, input: importPrivateKeyFields,
    examples: [{ cmd: "wallet-cli wallet import-private-key --label hot" }],
    run: async (ctx, _net, input) => {
      const secret = await ctx.secrets.resolveSecret("privateKey");
      const { accountId, created } = ks.import({ secret, type: "privateKey", label: input.label });
      return { status: statusOf(created), ...ks.describe(accountId) };
    },
  } satisfies CommandDefinition);

  // ── wallet import-ledger ────────────────────────────────────────────────────
  reg.add({
    id: "wallet.import-ledger", path: ["import-ledger"], network: "none", wallet: "none", auth: "none",
    summary: "register a Ledger account (watch-only; signs on the device)", fields: walletImportLedgerFields, input: walletImportLedgerInput,
    examples: [{ cmd: "wallet-cli wallet import-ledger --app ethereum --index 0 --label cold" }],
    run: async (ctx, _net, input) => {
      const family: ChainFamily = input.app === "ethereum" ? "evm" : "tron";
      const hasLocator = input.index !== undefined || input.path !== undefined || input.address !== undefined;
      const path = hasLocator || !ctx.prompt.isTTY()
        ? await resolveLedgerPath(services.ledger, family, input)
        : await interactiveLedgerSelect(services.ledger, family, ctx.prompt);
      ctx.emit({ type: "awaiting_device", reason: "verify_address" });
      const address = await services.ledger.getAddress(family, path, { display: false });
      const { accountId, created } = ks.registerLedger({ family, path, address, label: input.label });
      return { status: statusOf(created), ...ks.describe(accountId) };
    },
  } satisfies CommandDefinition);

  // ── wallet import-watch ──────────────────────────────────────────────────────
  const importWatchFields = z.object({
    address: z.string().min(1).describe("watch-only address to track; format: TRON base58 T... or EVM 0x...; family is auto-detected"),
    label: Schemas.label().optional().describe("human-friendly unique account label, 1-64 chars; omit to auto-generate"),
  });
  reg.add({
    id: "wallet.import-watch", path: ["import-watch"], network: "none", wallet: "none", auth: "none",
    summary: "register a watch-only address (no secret)", fields: importWatchFields, input: importWatchFields,
    examples: [{ cmd: "wallet-cli wallet import-watch --address T... --label team-vault" }],
    run: async (_ctx, _net, input) => {
      const address = input.address.trim();
      const family = detectWatchFamily(address);
      const { accountId, created } = ks.registerWatch({ family, address, label: input.label });
      return { status: statusOf(created), ...ks.describe(accountId) };
    },
  } satisfies CommandDefinition);

  // ── wallet list ─────────────────────────────────────────────────────────────
  reg.add({
    id: "wallet.list", path: ["list"], network: "none", wallet: "none", auth: "none",
    summary: "list wallets/accounts (no unlock needed)", fields: empty, input: empty,
    examples: [{ cmd: "wallet-cli wallet list --output json" }],
    run: async () => ks.list(),
  } satisfies CommandDefinition);

  // ── wallet set-active ────────────────────────────────────────────────────────
  const setActiveFields = z.object({ account: z.string().min(1).describe("accountId, label, or address to make active for future commands") });
  reg.add({
    id: "wallet.set-active", path: ["set-active"], network: "none", wallet: "none", auth: "none",
    summary: "set the active account", fields: setActiveFields, input: setActiveFields,
    examples: [{ cmd: "wallet-cli wallet set-active --account main" }],
    run: async (_ctx, _net, input) => {
      const { accountId, previous } = ks.setActive(input.account);
      return { previous, ...ks.describe(accountId) };
    },
  } satisfies CommandDefinition);

  // ── wallet active ─────────────────────────────────────────────────────────────
  reg.add({
    id: "wallet.active", path: ["active"], network: "none", wallet: "optional", auth: "none",
    summary: "show the current active account", fields: empty, input: empty,
    examples: [{ cmd: "wallet-cli wallet active" }],
    run: async (ctx) => ks.describe(ctx.activeAccount),
  } satisfies CommandDefinition);

  // ── wallet export-address ────────────────────────────────────────────────────
  // Chain is selected by global --network (resolved to its family); omitted → show both chains.
  reg.add({
    id: "wallet.export-address", path: ["export-address"], network: "none", wallet: "optional", auth: "none",
    summary: "show an account's receive addresses", fields: empty, input: empty,
    examples: [{ cmd: "wallet-cli wallet export-address --network nile --account main" }],
    run: async (ctx) => {
      const d = ks.describe(ctx.activeAccount);
      const family = ctx.network ? ctx.networkRegistry.resolve(ctx.network).family : undefined;
      const addresses = family ? { [family]: d.addresses[family] } : d.addresses;
      return { ...d, addresses };
    },
  } satisfies CommandDefinition);

  // ── wallet rename ─────────────────────────────────────────────────────────────
  const renameFields = z.object({
    account: z.string().min(1).describe("accountId, current label, or address to rename"),
    label: Schemas.label().describe("new unique label, 1-64 chars"),
  });
  reg.add({
    id: "wallet.rename", path: ["rename"], network: "none", wallet: "none", auth: "none",
    summary: "rename an account label", fields: renameFields, input: renameFields,
    examples: [{ cmd: "wallet-cli wallet rename --account main --label primary" }],
    run: async (_ctx, _net, input) => {
      const { accountId, previousLabel } = ks.rename(input.account, input.label);
      return { previousLabel, ...ks.describe(accountId) };
    },
  } satisfies CommandDefinition);

  // ── wallet add-account ────────────────────────────────────────────────────────
  const addAccountFields = z.object({
    account: z.string().min(1).describe("seed wallet accountId, label, or address to derive from"),
    index: z.coerce.number().int().nonnegative().optional().describe("explicit HD account index, in account index; omit to use the next free index"),
    label: Schemas.label().optional().describe("label for the new derived account, 1-64 chars; omit to auto-generate"),
  });
  reg.add({
    id: "wallet.add-account", path: ["add-account"], network: "none", wallet: "none", auth: "required",
    summary: "derive an HD account in a seed wallet (next free, or --index)", fields: addAccountFields, input: addAccountFields,
    examples: [{ cmd: "wallet-cli wallet add-account --account main --index 3" }],
    run: async (_ctx, _net, input) => {
      const { wallet } = ks.resolveAccount(input.account);
      const { accountId, created } = ks.addAccount(wallet.id, input.index);
      if (input.label) ks.rename(accountId, input.label);
      return { status: statusOf(created), ...ks.describe(accountId) };
    },
  } satisfies CommandDefinition);

  // ── wallet delete ─────────────────────────────────────────────────────────────
  const deleteFields = z.object({
    account: accountRef("account or wallet to delete, addressed by accountId, label, or address"),
    yes: z.boolean().default(false).describe("skip the interactive confirmation; required for non-TTY deletion"),
  });
  reg.add({
    id: "wallet.delete", path: ["delete"], network: "none", wallet: "none", auth: "none",
    summary: "delete a wallet/account and clean orphan labels", fields: deleteFields, input: deleteFields,
    examples: [{ cmd: "wallet-cli wallet delete --account old --yes" }],
    run: async (ctx, _net, input) => {
      if (!input.yes) {
        if (!ctx.prompt.isTTY()) {
          throw new UsageError("tty_required", "deletion needs confirmation: pass --yes or run in a terminal");
        }
        const d = ks.describe(input.account);
        const expect = d.label ?? d.accountId;
        const kind = d.label ? "label" : "ref";
        const ok = await ctx.prompt.confirm({ label: `Delete ${expect}? Type the exact ${kind} to confirm`, expect });
        if (!ok) throw new UsageError("aborted", "deletion not confirmed");
      }
      return ks.delete(input.account);
    },
  } satisfies CommandDefinition);

  // ── wallet backup ─────────────────────────────────────────────────────────────
  // Writes the secret + metadata to a 0600 FILE (never stdout/envelope): the secret stays off
  // screen, logs and AI context. stdout returns only metadata + the written path.
  // master password via dispatch prime (passwordMode: "verify"); --password-stdin is the non-interactive source.
  const backupFields = z.object({
    account: accountRef("account or wallet to export, addressed by accountId, label, or address"),
    out: z.string().optional().describe("output file path; omit to write <wallet-cli-root>/backups/<accountId>-<timestamp>.json; file is created with mode 0600 and never overwritten"),
  });
  reg.add({
    id: "wallet.backup", path: ["backup"], network: "none", wallet: "none", auth: "required", passwordMode: "verify",
    summary: "export an account's secret + metadata to a 0600 file", fields: backupFields, input: backupFields,
    examples: [{ cmd: "wallet-cli wallet backup --account main --out ~/main-backup.json --password-stdin" }],
    run: async (_ctx, _net, input) => {
      const d = ks.describe(input.account);
      const { wallet } = ks.resolveAccount(input.account);
      const src = wallet.source;
      // file payload (incl. plaintext secret) — written to a 0600 file, NEVER returned/logged.
      const fileMeta = { accountId: d.accountId, type: src.type, addresses: d.addresses };
      let backup: Record<string, unknown>;
      let secretType: string;
      let passphraseSet = false;
      if (src.type === "seed") {
        const revealed = ks.revealMnemonic(src.vaultId);
        passphraseSet = revealed.passphraseSet;
        secretType = "mnemonic";
        backup = { ...fileMeta, secretType, passphraseSet, mnemonic: revealed.mnemonic };
      } else if (src.type === "privateKey") {
        secretType = "privateKey";
        backup = { ...fileMeta, secretType, privateKey: bytesToHex(ks.decryptKey(src.keyId)) };
      } else throw new WalletError("watch_only_no_signer", `${src.type} accounts hold no exportable secret`);

      const path = backupOutPath(input.out, d.accountId);
      const bytes = writeBackupFile(path, backup);
      // envelope: full descriptor + secret-shape metadata + file facts — but no secret material.
      return { ...d, secretType, passphraseSet, out: path, fileMode: "0600", bytes };
    },
  } satisfies CommandDefinition);
}
