/**
 * Neutral command group (L4) — wallet / config / chains / capabilities. Not chain-bound,
 * no --network (capabilities excepted). Uses Keystore/ConfigLoader directly, not TxPipeline.
 * (plan §3 L4 中立命令群組 / §7.11)
 */
import { z } from "zod";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { existsSync, readFileSync } from "node:fs";
import type { ChainFamily, CommandDefinition, Wallet } from "../types/index.js";
import { Schemas } from "../contract/index.js";
import { CommandRegistry } from "../registry/index.js";
import type { Services } from "./services.js";
import { Derivation } from "../derivation/index.js";
import { resolveLedgerPath } from "../ledger/index.js";
import { walletAddress } from "../keystore/index.js";
import { camelToKebab } from "../adapter/index.js";
import { ConfigLoader } from "../config/index.js";
import { AtomicFileStore } from "../fs/index.js";
import { UsageError } from "../errors/index.js";

/** both-chain address projection of an account, for command output. */
function bothAddresses(wallet: Wallet, index?: number): { tron?: string; evm?: string } {
  return { tron: walletAddress(wallet, "tron", index), evm: walletAddress(wallet, "evm", index) };
}

// ── wallet import contract ────────────────────────────────────────────────────
const LEDGER_ONLY = ["app", "index", "path", "address", "scanLimit"] as const;
const importFields = z.object({
  type: z.enum(["seed", "privateKey", "ledger"]).describe("secret source"),
  label: Schemas.label().optional(),
  passphrase: z.string().optional().describe("BIP39 passphrase (seed only)"),
  app: z.enum(["tron", "ethereum"]).optional().describe("ledger app / chain (ledger only)"),
  index: z.coerce.number().int().nonnegative().optional().describe("ledger account index (ledger only)"),
  path: z.string().optional().describe("explicit BIP32 path (ledger only)"),
  address: z.string().optional().describe("known address to locate on the device (ledger only)"),
  scanLimit: z.coerce.number().int().positive().optional().describe("accounts to scan for --address (default 20)"),
});
/** whole-object validation: ledger needs --app + ≤1 locator; non-ledger forbids ledger-only flags. */
export const walletImportInput = importFields.superRefine((v, ctx) => {
  if (v.type === "ledger") {
    if (!v.app) ctx.addIssue({ code: "custom", path: ["app"], message: "--app is required for ledger import (tron|ethereum)" });
    const locators = [v.index !== undefined, v.path !== undefined, v.address !== undefined].filter(Boolean).length;
    if (locators > 1) {
      ctx.addIssue({ code: "custom", path: ["index"], message: "--index, --path and --address are mutually exclusive" });
    }
  } else {
    for (const k of LEDGER_ONLY) {
      if (v[k] !== undefined) {
        ctx.addIssue({ code: "custom", path: [k], message: `--${camelToKebab(k)} is only valid for --type ledger` });
      }
    }
  }
});

export function registerNeutralCommands(reg: CommandRegistry, services: Services): void {
  const ks = services.keystore;
  const empty = z.object({});

  // ── wallet create ────────────────────────────────────────────────────────
  const createFields = z.object({ label: Schemas.label().optional() });
  reg.add({
    id: "wallet.create", path: ["create"], network: "none", wallet: "none", auth: "required",
    summary: "create a new HD wallet (BIP39 seed)", fields: createFields, input: createFields,
    examples: [{ cmd: "wallet-cli wallet create --label main" }],
    run: async (ctx, _net, input) => {
      const mnemonic = Derivation.generateMnemonic();
      const ref = ks.import({ secret: mnemonic, type: "seed", label: input.label });
      ctx.streams.diagnostic("info", `SAVE YOUR RECOVERY PHRASE (shown once, not stored in output):\n${mnemonic}`);
      const { wallet, index } = ks.resolveAccount(ref);
      return { account: ref, addresses: bothAddresses(wallet, index) };
    },
  } satisfies CommandDefinition);

  reg.add({
    id: "wallet.import", path: ["import"], network: "none", wallet: "none", auth: "optional",
    summary: "import a seed / private key / register a ledger", fields: importFields, input: walletImportInput,
    examples: [
      { cmd: "echo $MNEMONIC | wallet-cli wallet import --type seed --mnemonic-stdin --label main" },
      { cmd: "wallet-cli wallet import --type ledger --app ethereum --index 0 --label cold" },
    ],
    run: async (ctx, _net, input) => {
      if (input.type === "ledger") {
        const family: ChainFamily = input.app === "ethereum" ? "evm" : "tron";
        const path = await resolveLedgerPath(services.ledger, family, input);
        ctx.emit({ type: "awaiting_device", reason: "verify_address" });
        const address = await services.ledger.getAddress(family, path, { display: false });
        const ref = ks.registerLedger({ family, path, address, label: input.label });
        return { account: ref, addresses: { [family]: address } };
      }
      const secret = ctx.secrets.read(input.type === "seed" ? "mnemonic" : "privateKey");
      const ref = ks.import({ secret, type: input.type, passphrase: input.passphrase, label: input.label });
      const { wallet, index } = ks.resolveAccount(ref);
      return { account: ref, addresses: bothAddresses(wallet, index) };
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

  // ── wallet export-address ────────────────────────────────────────────────────
  const exportFields = z.object({ family: z.enum(["tron", "evm"]).optional().describe("limit to one chain") });
  reg.add({
    id: "wallet.export-address", path: ["export-address"], network: "none", wallet: "optional", auth: "none",
    summary: "show the active account's addresses", fields: exportFields, input: exportFields,
    examples: [{ cmd: "wallet-cli wallet export-address --family evm" }],
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
  const addAccountFields = z.object({ wallet: z.string().min(1).describe("wallet id or label") });
  reg.add({
    id: "wallet.add-account", path: ["add-account"], network: "none", wallet: "none", auth: "required",
    summary: "derive the next HD account in a wallet", fields: addAccountFields, input: addAccountFields,
    examples: [{ cmd: "wallet-cli wallet add-account --wallet main" }],
    run: async (_ctx, _net, input) => {
      const w = ks.resolveWallet(input.wallet);
      return { account: ks.addAccount(w.id) };
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
    run: async (_ctx, net) => ({ network: net!.id, capabilities: services.capabilityRegistry.list(net!.id) }),
  } satisfies CommandDefinition);
}
