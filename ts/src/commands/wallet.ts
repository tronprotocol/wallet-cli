/**
 * Wallet command group (L4) — create/import/list/active/backup… Not chain-bound, no --network.
 * Uses Keystore/Ledger directly, not TxPipeline. (plan §3 L4 中立命令群組 / §7.11)
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { ChainFamily, CommandDefinition, Wallet } from "../core/types/index.js";
import { Schemas } from "../infra/contract/index.js";
import { CommandRegistry } from "../runtime/registry/index.js";
import type { Services } from "./services.js";
import { Derivation } from "../core/derivation/index.js";
import { resolveLedgerPath } from "../infra/ledger/index.js";
import { walletAddress, accountRef } from "../infra/keystore/index.js";
import { ConfigLoader } from "../infra/config/index.js";
import { familyOf } from "../core/family/index.js";
import { UsageError, WalletError } from "../core/errors/index.js";

/** both-chain address projection of an account, for command output. */
function bothAddresses(wallet: Wallet, index?: number): { tron?: string; evm?: string } {
  return { tron: walletAddress(wallet, "tron", index), evm: walletAddress(wallet, "evm", index) };
}

/** `wallet backup` output path: explicit --out, else <root>/backups/<ref>-<ts>.json. */
function backupOutPath(out: string | undefined, ref: string): string {
  if (out) return resolve(out);
  return join(ConfigLoader.resolveRoot(), "backups", `${ref}-${Date.now()}.json`);
}

/** Write the backup (incl. plaintext secret) to a fresh 0600 file; never clobber an existing one. */
function writeBackupFile(path: string, data: unknown): void {
  if (existsSync(path)) throw new UsageError("output_exists", `refusing to overwrite existing file: ${path}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
}

// ── wallet import-ledger contract (module scope so it can be unit-tested) ───────
export const walletImportLedgerFields = z.object({
  app: z.enum(["tron", "ethereum"]).describe("ledger app / chain"),
  index: z.coerce.number().int().nonnegative().optional().describe("account index"),
  path: z.string().optional().describe("explicit BIP32 path"),
  address: z.string().optional().describe("known address to locate (bounded scan)"),
  scanLimit: z.coerce.number().int().positive().optional().describe("--address scan limit (default 20)"),
  label: Schemas.label().optional(),
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
    label: Schemas.label().optional(),
    words: z.coerce.number().refine((v) => v === 12 || v === 24, "must be 12 or 24").default(12).describe("mnemonic word count"),
  });
  reg.add({
    id: "wallet.create", path: ["create"], network: "none", wallet: "none", auth: "required",
    summary: "create a new HD wallet (BIP39 seed)", fields: createFields, input: createFields,
    examples: [{ cmd: "wallet-cli wallet create --label main --words 24" }],
    run: async (_ctx, _net, input) => {
      const mnemonic = Derivation.generateMnemonic(input.words === 24 ? 256 : 128);
      const ref = ks.import({ secret: mnemonic, type: "seed", label: input.label });
      // recovery phrase is never printed: it's stored encrypted and retrievable via `wallet backup`.
      const { wallet, index } = ks.resolveAccount(ref);
      return { account: ref, addresses: bothAddresses(wallet, index) };
    },
  } satisfies CommandDefinition);

  // ── wallet import-mnemonic ─────────────────────────────────────────────────
  // BIP39 passphrase intentionally NOT exposed in phase 1 (§7.14.3); plumbing stays.
  // TODO:interactive — mnemonic + master password should be read via interactive hidden input
  // (spec §6 / plan §7.13.1). Both secrets can't share fd 0, so this is not runnable
  // non-interactively until the prompt layer lands; secret read stays on --mnemonic-stdin meanwhile.
  const importMnemonicFields = z.object({ label: Schemas.label().optional() });
  reg.add({
    id: "wallet.import-mnemonic", path: ["import-mnemonic"], network: "none", wallet: "none", auth: "required",
    summary: "import an existing BIP39 mnemonic (encrypted at rest)", fields: importMnemonicFields, input: importMnemonicFields,
    examples: [{ cmd: "wallet-cli wallet import-mnemonic --label main" }],
    run: async (ctx, _net, input) => {
      const secret = ctx.secrets.require("mnemonic");
      const ref = ks.import({ secret, type: "seed", label: input.label });
      const { wallet, index } = ks.resolveAccount(ref);
      return { account: ref, addresses: bothAddresses(wallet, index) };
    },
  } satisfies CommandDefinition);

  // ── wallet import-private-key ──────────────────────────────────────────────
  // TODO:interactive — private key + master password should be read via interactive hidden input
  // (spec §6 / plan §7.13.1); see import-mnemonic note. Secret read stays on --private-key-stdin meanwhile.
  const importPrivateKeyFields = z.object({ label: Schemas.label().optional() });
  reg.add({
    id: "wallet.import-private-key", path: ["import-private-key"], network: "none", wallet: "none", auth: "required",
    summary: "import an existing private key (encrypted at rest)", fields: importPrivateKeyFields, input: importPrivateKeyFields,
    examples: [{ cmd: "wallet-cli wallet import-private-key --label hot" }],
    run: async (ctx, _net, input) => {
      const secret = ctx.secrets.require("privateKey");
      const ref = ks.import({ secret, type: "privateKey", label: input.label });
      const { wallet, index } = ks.resolveAccount(ref);
      return { account: ref, addresses: bothAddresses(wallet, index) };
    },
  } satisfies CommandDefinition);

  // ── wallet import-ledger ────────────────────────────────────────────────────
  reg.add({
    id: "wallet.import-ledger", path: ["import-ledger"], network: "none", wallet: "none", auth: "none",
    summary: "register a Ledger account (watch-only; signs on the device)", fields: walletImportLedgerFields, input: walletImportLedgerInput,
    examples: [{ cmd: "wallet-cli wallet import-ledger --app ethereum --index 0 --label cold" }],
    run: async (ctx, _net, input) => {
      const family: ChainFamily = input.app === "ethereum" ? "evm" : "tron";
      const path = await resolveLedgerPath(services.ledger, family, input);
      ctx.emit({ type: "awaiting_device", reason: "verify_address" });
      const address = await services.ledger.getAddress(family, path, { display: false });
      const ref = ks.registerLedger({ family, path, address, label: input.label });
      return { account: ref, addresses: { [family]: address } };
    },
  } satisfies CommandDefinition);

  // ── wallet import-watch ──────────────────────────────────────────────────────
  const importWatchFields = z.object({
    address: z.string().min(1).describe("address to track (family auto-detected: T… / 0x…)"),
    label: Schemas.label().optional(),
  });
  reg.add({
    id: "wallet.import-watch", path: ["import-watch"], network: "none", wallet: "none", auth: "none",
    summary: "register a watch-only address (no secret)", fields: importWatchFields, input: importWatchFields,
    examples: [{ cmd: "wallet-cli wallet import-watch --address T... --label team-vault" }],
    run: async (_ctx, _net, input) => {
      const address = input.address.trim();
      const family = detectWatchFamily(address);
      const ref = ks.registerWatch({ family, address, label: input.label });
      return { account: ref, addresses: { [family]: address } };
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
  const setActiveFields = z.object({ account: z.string().min(1).describe("ref, label, or address to activate") });
  reg.add({
    id: "wallet.set-active", path: ["set-active"], network: "none", wallet: "none", auth: "none",
    summary: "set the active account", fields: setActiveFields, input: setActiveFields,
    examples: [{ cmd: "wallet-cli wallet set-active --account main" }],
    run: async (_ctx, _net, input) => ({ active: ks.setActive(input.account) }),
  } satisfies CommandDefinition);

  // ── wallet active ─────────────────────────────────────────────────────────────
  reg.add({
    id: "wallet.active", path: ["active"], network: "none", wallet: "optional", auth: "none",
    summary: "show the current active account", fields: empty, input: empty,
    examples: [{ cmd: "wallet-cli wallet active" }],
    run: async (ctx) => {
      const { wallet, index } = ks.resolveAccount(ctx.activeAccount);
      return { account: ctx.activeAccount, type: wallet.source.type, addresses: bothAddresses(wallet, index) };
    },
  } satisfies CommandDefinition);

  // ── wallet export-address ────────────────────────────────────────────────────
  // Chain is selected by --network (resolved to its family); omitted → show both chains.
  const exportFields = z.object({
    network: z.string().optional().describe("show the address for this network's chain (omit = all chains)"),
  });
  reg.add({
    id: "wallet.export-address", path: ["export-address"], network: "none", wallet: "optional", auth: "none",
    summary: "show an account's receive addresses", fields: exportFields, input: exportFields,
    examples: [{ cmd: "wallet-cli wallet export-address --network nile --account main" }],
    run: async (ctx, _net, input) => {
      const { wallet, index } = ks.resolveAccount(ctx.activeAccount);
      const all = bothAddresses(wallet, index);
      const family = input.network ? ctx.networkRegistry.resolve(input.network).family : undefined;
      const addresses = family ? { [family]: all[family] } : all;
      return { account: ctx.activeAccount, addresses };
    },
  } satisfies CommandDefinition);

  // ── wallet rename ─────────────────────────────────────────────────────────────
  const renameFields = z.object({
    account: z.string().min(1).describe("ref, current label, or address"),
    label: Schemas.label().describe("new unique label"),
  });
  reg.add({
    id: "wallet.rename", path: ["rename"], network: "none", wallet: "none", auth: "none",
    summary: "rename an account label", fields: renameFields, input: renameFields,
    examples: [{ cmd: "wallet-cli wallet rename --account main --label primary" }],
    run: async (_ctx, _net, input) => {
      ks.rename(input.account, input.label);
      return { account: input.account, label: input.label };
    },
  } satisfies CommandDefinition);

  // ── wallet add-account ────────────────────────────────────────────────────────
  const addAccountFields = z.object({
    account: z.string().min(1).describe("seed wallet (ref, label, or address) to derive from"),
    index: z.coerce.number().int().nonnegative().optional().describe("explicit HD account index (default: next free)"),
    label: Schemas.label().optional().describe("label for the new sub-account"),
  });
  reg.add({
    id: "wallet.add-account", path: ["add-account"], network: "none", wallet: "none", auth: "required",
    summary: "derive an HD account in a seed wallet (next free, or --index)", fields: addAccountFields, input: addAccountFields,
    examples: [{ cmd: "wallet-cli wallet add-account --account main --index 3" }],
    run: async (_ctx, _net, input) => {
      const { wallet } = ks.resolveAccount(input.account);
      const ref = ks.addAccount(wallet.id, input.index);
      if (input.label) ks.rename(ref, input.label);
      return { account: ref, label: input.label };
    },
  } satisfies CommandDefinition);

  // ── wallet delete ─────────────────────────────────────────────────────────────
  const deleteFields = z.object({ account: z.string().min(1).describe("account or wallet (ref, label, or address)") });
  reg.add({
    id: "wallet.delete", path: ["delete"], network: "none", wallet: "none", auth: "none",
    summary: "delete a wallet/account and clean orphan labels", fields: deleteFields, input: deleteFields,
    examples: [{ cmd: "wallet-cli wallet delete --account old" }],
    run: async (_ctx, _net, input) => {
      ks.delete(input.account);
      return { deleted: input.account };
    },
  } satisfies CommandDefinition);

  // ── wallet backup ─────────────────────────────────────────────────────────────
  // Writes the secret + metadata to a 0600 FILE (never stdout/envelope): the secret stays off
  // screen, logs and AI context. stdout returns only metadata + the written path.
  // TODO:interactive — master password should be read via interactive hidden input
  // (spec §6 / plan §7.13.1); single secret, so --password-stdin still works meanwhile.
  const backupFields = z.object({
    account: z.string().min(1).describe("account or wallet (ref, label, or address)"),
    out: z.string().optional().describe("output file path (default: <root>/backups/<ref>-<ts>.json)"),
  });
  reg.add({
    id: "wallet.backup", path: ["backup"], network: "none", wallet: "none", auth: "required",
    summary: "export an account's secret + metadata to a 0600 file", fields: backupFields, input: backupFields,
    examples: [{ cmd: "wallet-cli wallet backup --account main --out ~/main-backup.json --password-stdin" }],
    run: async (_ctx, _net, input) => {
      const { wallet, index } = ks.resolveAccount(input.account);
      const src = wallet.source;
      const meta = { account: input.account, walletId: wallet.id, type: src.type, addresses: bothAddresses(wallet, index) };
      let backup: Record<string, unknown>;
      if (src.type === "seed") backup = { ...meta, secretType: "mnemonic", mnemonic: ks.revealMnemonic(src.vaultId) };
      else if (src.type === "privateKey") backup = { ...meta, secretType: "privateKey", privateKey: bytesToHex(ks.decryptKey(src.keyId)) };
      else throw new WalletError("watch_only_no_signer", `${src.type} accounts hold no exportable secret`);

      const ref = accountRef(wallet.id, src.type === "seed" ? index : null);
      const path = backupOutPath(input.out, ref);
      writeBackupFile(path, backup);
      return { account: input.account, type: src.type, addresses: meta.addresses, out: path };
    },
  } satisfies CommandDefinition);
}
