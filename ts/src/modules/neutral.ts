/**
 * Neutral command group (L4) — wallet / config / chains / capabilities. Not chain-bound,
 * no --network (capabilities excepted). Uses Keystore/ConfigLoader directly, not TxPipeline.
 * (plan §3 L4 中立命令群組 / §7.11)
 */
import { z } from "zod";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { existsSync, readFileSync } from "node:fs";
import type { CommandDefinition } from "../types/index.js";
import { Schemas } from "../contract/index.js";
import { CommandRegistry } from "../registry/index.js";
import type { Services } from "./services.js";
import { Derivation } from "../derivation/index.js";
import { ConfigLoader } from "../config/index.js";
import { AtomicFileStore } from "../fs/index.js";
import { UsageError } from "../errors/index.js";

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
      const { wallet } = ks.resolveAccount(ref);
      return { account: ref, addresses: wallet.addresses["0"] };
    },
  } satisfies CommandDefinition);

  // ── wallet import ──────────────────────────────────────────────────────────
  const importFields = z.object({
    type: z.enum(["seed", "privateKey", "ledger"]).describe("secret source"),
    label: Schemas.label().optional(),
    passphrase: z.string().optional().describe("optional BIP39 passphrase (seed only)"),
  });
  reg.add({
    id: "wallet.import", path: ["import"], network: "none", wallet: "none", auth: "optional",
    summary: "import a seed / private key / register a ledger", fields: importFields, input: importFields,
    examples: [{ cmd: "echo $MNEMONIC | wallet-cli wallet import --type seed --mnemonic-stdin --label main" }],
    run: async (ctx, _net, input) => {
      if (input.type === "ledger") {
        ctx.streams.diagnostic("warn", "confirm address export on the Ledger device…");
        const tron = await services.ledger.getAddress("tron", Derivation.path("tron", 0));
        const evm = await services.ledger.getAddress("evm", Derivation.path("evm", 0));
        const ref = ks.registerLedger({ addresses: { tron, evm }, label: input.label });
        return { account: ref };
      }
      const secret = ctx.secrets.read(input.type === "seed" ? "mnemonic" : "privateKey");
      const ref = ks.import({ secret, type: input.type, passphrase: input.passphrase, label: input.label });
      const { wallet, key } = ks.resolveAccount(ref);
      return { account: ref, addresses: wallet.addresses[key] };
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
      const { wallet, key } = ks.resolveAccount(ctx.activeAccount);
      const all = wallet.addresses[key] ?? {};
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
