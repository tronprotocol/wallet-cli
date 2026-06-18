/**
 * Neutral command group (L4) — wallet / config / chains / capabilities. Not chain-bound,
 * no --network (capabilities excepted). Uses Keystore/ConfigLoader directly, not TxPipeline.
 * (plan §3 L4 中立命令群組 / §7.11)
 */
import { z } from "zod";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { existsSync, readFileSync } from "node:fs";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { ChainFamily, CommandDefinition, Wallet } from "../core/types/index.js";
import { Schemas } from "../infra/contract/index.js";
import { CommandRegistry } from "../runtime/registry/index.js";
import type { Services } from "./services.js";
import { Derivation } from "../core/derivation/index.js";
import { resolveLedgerPath } from "../infra/ledger/index.js";
import { walletAddress } from "../infra/keystore/index.js";
import { addressCodec } from "../core/address/index.js";
import { ConfigLoader } from "../infra/config/index.js";
import { AtomicFileStore } from "../core/fs/index.js";
import { UsageError, WalletError } from "../core/errors/index.js";

/** both-chain address projection of an account, for command output. */
function bothAddresses(wallet: Wallet, index?: number): { tron?: string; evm?: string } {
  return { tron: walletAddress(wallet, "tron", index), evm: walletAddress(wallet, "evm", index) };
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
  if (addressCodec("tron").validate(address)) return "tron";
  if (addressCodec("evm").validate(address)) return "evm";
  throw new UsageError("invalid_option", `unrecognised address format: ${address}`);
}

export function registerNeutralCommands(reg: CommandRegistry, services: Services): void {
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
    run: async (ctx, _net, input) => {
      const mnemonic = Derivation.generateMnemonic(input.words === 24 ? 256 : 128);
      const ref = ks.import({ secret: mnemonic, type: "seed", label: input.label });
      ctx.streams.diagnostic("info", `SAVE YOUR RECOVERY PHRASE (shown once, not stored in output):\n${mnemonic}`);
      const { wallet, index } = ks.resolveAccount(ref);
      return { account: ref, addresses: bothAddresses(wallet, index) };
    },
  } satisfies CommandDefinition);

  // ── wallet import-mnemonic ─────────────────────────────────────────────────
  // BIP39 passphrase intentionally NOT exposed in phase 1 (§7.14.3); plumbing stays.
  const importMnemonicFields = z.object({ label: Schemas.label().optional() });
  reg.add({
    id: "wallet.import-mnemonic", path: ["import-mnemonic"], network: "none", wallet: "none", auth: "required",
    summary: "import an existing BIP39 mnemonic (encrypted at rest)", fields: importMnemonicFields, input: importMnemonicFields,
    examples: [{ cmd: "wallet-cli wallet import-mnemonic --mnemonic-stdin --password-file <(security ...) --label main" }],
    run: async (ctx, _net, input) => {
      const secret = ctx.secrets.require("mnemonic");
      const ref = ks.import({ secret, type: "seed", label: input.label });
      const { wallet, index } = ks.resolveAccount(ref);
      return { account: ref, addresses: bothAddresses(wallet, index) };
    },
  } satisfies CommandDefinition);

  // ── wallet import-private-key ──────────────────────────────────────────────
  const importPrivateKeyFields = z.object({ label: Schemas.label().optional() });
  reg.add({
    id: "wallet.import-private-key", path: ["import-private-key"], network: "none", wallet: "none", auth: "required",
    summary: "import an existing private key (encrypted at rest)", fields: importPrivateKeyFields, input: importPrivateKeyFields,
    examples: [{ cmd: "wallet-cli wallet import-private-key --private-key-file <(op read ...) --password-file <(...) --label hot" }],
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
  const setActiveFields = z.object({ account: z.string().min(1).describe("ref or label to activate") });
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
  const exportFields = z.object({ family: z.enum(["tron", "evm"]).optional().describe("limit to one chain") });
  reg.add({
    id: "wallet.export-address", path: ["export-address"], network: "none", wallet: "optional", auth: "none",
    summary: "show an account's receive addresses", fields: exportFields, input: exportFields,
    examples: [{ cmd: "wallet-cli wallet export-address --family evm --account main" }],
    run: async (ctx, _net, input) => {
      const { wallet, index } = ks.resolveAccount(ctx.activeAccount);
      const all = bothAddresses(wallet, index);
      const addresses =
        input.family === "tron" ? { tron: all.tron }
        : input.family === "evm" ? { evm: all.evm }
        : all;
      return { account: ctx.activeAccount, addresses };
    },
  } satisfies CommandDefinition);

  // ── wallet rename ─────────────────────────────────────────────────────────────
  const renameFields = z.object({
    account: z.string().min(1).describe("ref or current label"),
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
    account: z.string().min(1).describe("seed wallet (ref or label) to derive from"),
    label: Schemas.label().optional().describe("label for the new sub-account"),
  });
  reg.add({
    id: "wallet.add-account", path: ["add-account"], network: "none", wallet: "none", auth: "required",
    summary: "derive the next HD account in a seed wallet", fields: addAccountFields, input: addAccountFields,
    examples: [{ cmd: "wallet-cli wallet add-account --account main" }],
    run: async (_ctx, _net, input) => {
      const { wallet } = ks.resolveAccount(input.account);
      const ref = ks.addAccount(wallet.id);
      if (input.label) ks.rename(ref, input.label);
      return { account: ref, label: input.label };
    },
  } satisfies CommandDefinition);

  // ── wallet delete ─────────────────────────────────────────────────────────────
  const deleteFields = z.object({ account: z.string().min(1).describe("account or wallet (ref or label)") });
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
  // Only command that may write a secret to stdout — gated behind --reveal-secret.
  const backupFields = z.object({
    account: z.string().min(1).describe("account or wallet (ref or label)"),
    revealSecret: z.boolean().default(false).describe("output the mnemonic/private key (default: metadata only)"),
  });
  reg.add({
    id: "wallet.backup", path: ["backup"], network: "none", wallet: "none", auth: "required",
    summary: "export an account's secret (metadata-only unless --reveal-secret)", fields: backupFields, input: backupFields,
    examples: [{ cmd: "wallet-cli wallet backup --account main --reveal-secret --password-stdin" }],
    run: async (_ctx, _net, input) => {
      const { wallet, index } = ks.resolveAccount(input.account);
      const src = wallet.source;
      const meta = { account: input.account, walletId: wallet.id, type: src.type, addresses: bothAddresses(wallet, index) };
      if (!input.revealSecret) return meta;
      if (src.type === "seed") return { ...meta, secretType: "mnemonic", mnemonic: ks.revealMnemonic(src.vaultId) };
      if (src.type === "privateKey") return { ...meta, secretType: "privateKey", privateKey: bytesToHex(ks.decryptKey(src.keyId)) };
      throw new WalletError("watch_only_no_signer", `${src.type} accounts hold no exportable secret`);
    },
  } satisfies CommandDefinition);

  // ── config get / set ──────────────────────────────────────────────────────────
  reg.add({
    id: "config.get", path: ["get"], network: "none", wallet: "none", auth: "none",
    summary: "show effective config", fields: empty, input: empty,
    examples: [{ cmd: "wallet-cli config get" }],
    run: async (ctx) => ({
      defaultOutput: ctx.config.defaultOutput,
      timeoutMs: ctx.config.timeoutMs,
      networks: Object.keys(ctx.config.networks),
    }),
  } satisfies CommandDefinition);

  const configSetFields = z.object({
    key: z.enum(["defaultOutput", "timeoutMs"]).describe("config key"),
    value: z.string().min(1).describe("new value"),
  });
  reg.add({
    id: "config.set", path: ["set"], network: "none", wallet: "none", auth: "none",
    summary: "set a top-level config value", fields: configSetFields, input: configSetFields,
    examples: [{ cmd: "wallet-cli config set --key defaultOutput --value json" }],
    run: async (_ctx, _net, input) => {
      const path = ConfigLoader.configPath();
      const store = new AtomicFileStore();
      return store.withLock(path, () => {
        const current = existsSync(path) ? (parseYaml(readFileSync(path, "utf8")) ?? {}) : {};
        if (input.key === "timeoutMs") {
          const n = Number(input.value);
          if (!Number.isFinite(n) || n < 0) throw new UsageError("invalid_value", "timeoutMs must be a non-negative number");
          current.timeoutMs = n;
        } else {
          if (input.value !== "text" && input.value !== "json")
            throw new UsageError("invalid_value", "defaultOutput must be 'text' or 'json'");
          current.defaultOutput = input.value;
        }
        store.writeText(path, stringifyYaml(current));
        return { key: input.key, value: input.value };
      });
    },
  } satisfies CommandDefinition);

  // ── chains list ───────────────────────────────────────────────────────────────
  reg.add({
    id: "chains.list", path: ["list"], network: "none", wallet: "none", auth: "none",
    summary: "list known networks", fields: empty, input: empty,
    examples: [{ cmd: "wallet-cli chains list" }],
    run: async (ctx) =>
      ctx.networkRegistry.all().map((n) => ({
        id: n.id, family: n.family, chainId: n.chainId, aliases: n.aliases, feeModel: n.feeModel,
      })),
  } satisfies CommandDefinition);

  // ── capabilities (neutral but --network required) ──────────────────────────────
  reg.add({
    id: "capabilities", path: [], network: "required", wallet: "none", auth: "none",
    summary: "list capabilities supported by a network", fields: empty, input: empty,
    examples: [{ cmd: "wallet-cli capabilities --network nile" }],
    // network identity is already in the output envelope's chain field; return key+summary descriptors.
    run: async (_ctx, net) => ({ capabilities: services.capabilityRegistry.describe(net!.id) }),
  } satisfies CommandDefinition);
}
