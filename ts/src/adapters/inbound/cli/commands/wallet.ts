/**
 * Wallet root commands — create/import/list/current/use/backup. Not chain-bound; no --network.
 * Calls WalletService rather than the transaction pipeline.
 */
import { z } from "zod"
import type { CommandDefinition } from "../contracts/index.js"
import { Schemas } from "../schemas/index.js"
import { CommandRegistry } from "../registry/index.js"
import { accountRef, ciEnum } from "../arity/index.js"
import type { LedgerDevice } from "../../../../application/ports/ledger-device.js"
import type { QrEncoder } from "../../../../application/ports/qr-encoder.js"
import type { WalletService } from "../../../../application/use-cases/wallet-service.js"
import { resolveLedgerPath, selectLedgerPath } from "../../../../application/services/ledger-account.js"
import { ChainFamily, CHAIN_FAMILIES, FAMILIES } from "../../../../domain/family/index.js"
import { UsageError } from "../../../../domain/errors/index.js"
import { passwordPolicyErrors } from "../input/prompt/validators.js"
import { TextFormatters } from "../render/index.js"

// ── wallet import-ledger contract (module scope so it can be unit-tested) ───────
// The selectable Ledger apps are the families with a wired Ledger app (FAMILIES[f].ledger);
// the enum drives both --help and the interactive prompt.
const LEDGER_APP_BY_FAMILY: Partial<Record<ChainFamily, string>> = Object.fromEntries(CHAIN_FAMILIES.flatMap((f) => (FAMILIES[f].ledger ? [[f, FAMILIES[f].ledger!.app]] : [])))
const FAMILY_BY_LEDGER_APP: Record<string, ChainFamily> = Object.fromEntries((Object.entries(LEDGER_APP_BY_FAMILY) as [ChainFamily, string][]).map(([f, app]) => [app, f]))
const LEDGER_APPS = CHAIN_FAMILIES.map((f) => LEDGER_APP_BY_FAMILY[f]).filter((a): a is string => a !== undefined) as [string, ...string[]]
export const walletImportLedgerFields = z.object({
  app: ciEnum(LEDGER_APPS).describe("Ledger app to open on the device, selecting the address-derivation scheme"),
  index: z.coerce
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("HD account index to import; omit with no --path/--address to use index 0; mutually exclusive with --path and --address"),
  path: z.string().optional().describe("explicit BIP32 derivation path, e.g. m/44'/195'/0'/0/0 for TRON; mutually exclusive with --index and --address"),
  address: z.string().optional().describe("known address to locate by bounded scan; mutually exclusive with --index and --path"),
  scanLimit: z.coerce.number().int().positive().optional().describe("number of account indexes to scan when using --address, in indexes; omit to scan 20 indexes"),
  label: Schemas.label().optional().describe("human-friendly unique account label, 1-64 chars; omit to auto-generate"),
})
/** --index / --path / --address are mutually exclusive (at most one locator). */
export const walletImportLedgerInput = walletImportLedgerFields.superRefine((v, c) => {
  const locators = [v.index !== undefined, v.path !== undefined, v.address !== undefined].filter(Boolean).length
  if (locators > 1) c.addIssue({ code: "custom", path: ["index"], message: "--index, --path and --address are mutually exclusive" })
})

export function registerWalletCommands(
  reg: CommandRegistry,
  services: {
    walletService: WalletService;
    ledger: LedgerDevice;
    qr?: QrEncoder;
  },
): void {
  const wallets = services.walletService
  const empty = z.object({})

  // ── create ───────────────────────────────────────────────────────────────
  const createFields = z.object({
    label: Schemas.label().optional().describe("human-friendly unique account label, 1-64 chars; omit to auto-generate"),
  })
  reg.add({
    path: ["create"],
    network: "none",
    wallet: "none",
    auth: "required",
    passwordMode: "establish",
    interactive: true,
    promptHints: { label: "default-label" },
    summary: "Create a new HD wallet (BIP39 seed)",
    fields: createFields,
    input: createFields,
    examples: [{ cmd: "wallet-cli create --label main" }],
    formatText: TextFormatters.walletCreated("Created", ["Recovery phrase is encrypted locally and was not printed.", "Run `backup` soon and store the file offline."]),
    run: async (_ctx, _net, input) => {
      return wallets.create(input.label)
    },
  } satisfies CommandDefinition)

  // ── import mnemonic ───────────────────────────────────────────────────────
  // BIP39 passphrase intentionally NOT exposed in phase 1 ; plumbing stays.
  const importMnemonicFields = z.object({
    label: Schemas.label()
      .optional()
      .describe("human-friendly unique account label, 1-64 chars; omit to auto-generate; the mnemonic is entered interactively (hidden)"),
  })
  reg.add({
    path: ["import", "mnemonic"],
    network: "none",
    wallet: "none",
    auth: "required",
    passwordMode: "establish",
    interactive: true,
    secretsTtyOnly: true,
    promptHints: { label: "default-label" },
    summary: "Import a BIP39 mnemonic phrase",
    description:
      "Import a BIP39 mnemonic phrase. The recovery phrase and master password are read\n" +
      "interactively from the TTY (hidden input); they never touch argv or stdin.",
    fields: importMnemonicFields,
    input: importMnemonicFields,
    examples: [{ cmd: "wallet-cli import mnemonic --label main" }],
    formatText: TextFormatters.walletCreated("Imported", ["Recovery phrase was read from hidden input and was not printed."]),
    run: async (ctx, _net, input) => {
      const secret = await ctx.secrets.resolveSecret("mnemonic")
      return wallets.importMnemonic(secret, input.label)
    },
  } satisfies CommandDefinition)

  // ── import private-key ────────────────────────────────────────────────────
  const importPrivateKeyFields = z.object({
    label: Schemas.label()
      .optional()
      .describe("human-friendly unique account label, 1-64 chars; omit to auto-generate; the private key is entered interactively (hidden)"),
  })
  reg.add({
    path: ["import", "private-key"],
    network: "none",
    wallet: "none",
    auth: "required",
    passwordMode: "establish",
    interactive: true,
    secretsTtyOnly: true,
    promptHints: { label: "default-label" },
    summary: "Import a raw private key",
    description:
      "Import a raw private key. The private key and master password are read\n" +
      "interactively from the TTY (hidden input); they never touch argv or stdin.",
    fields: importPrivateKeyFields,
    input: importPrivateKeyFields,
    examples: [{ cmd: "wallet-cli import private-key --label hot" }],
    formatText: TextFormatters.walletCreated("Imported", ["Private key was read from hidden input and was not printed."]),
    run: async (ctx, _net, input) => {
      const secret = await ctx.secrets.resolveSecret("privateKey")
      return wallets.importPrivateKey(secret, input.label)
    },
  } satisfies CommandDefinition)

  // ── import ledger ─────────────────────────────────────────────────────────
  reg.add({
    path: ["import", "ledger"],
    network: "none",
    wallet: "none",
    auth: "none",
    interactive: true,
    promptHints: { label: "default-label", index: "skip", path: "skip", address: "skip", scanLimit: "skip" },
    requires: ["a connected, unlocked Ledger with the selected app (--app) open"],
    summary: "Register a Ledger account (watch-only; signs on device)",
    fields: walletImportLedgerFields,
    input: walletImportLedgerInput,
    examples: [{ cmd: "wallet-cli import ledger --app tron --index 0 --label cold" }],
    formatText: TextFormatters.walletLedger,
    run: async (ctx, _net, input) => {
      const family: ChainFamily = FAMILY_BY_LEDGER_APP[input.app]!
      const hasLocator = input.index !== undefined || input.path !== undefined || input.address !== undefined
      const path = hasLocator || !ctx.prompt.isTTY() ? await resolveLedgerPath(services.ledger, family, input) : await selectLedgerPath(services.ledger, family, ctx.prompt)
      ctx.emit({ type: "deriving-address" })
      return wallets.importLedger(family, path, input.label)
    },
  } satisfies CommandDefinition)

  // ── import watch ──────────────────────────────────────────────────────────
  const importWatchFields = z.object({
    address: z.string().min(1).describe("watch-only address to track; format: TRON base58 T...; family is auto-detected"),
    label: Schemas.label().optional().describe("human-friendly unique account label, 1-64 chars; omit to auto-generate"),
  })
  reg.add({
    path: ["import", "watch"],
    network: "none",
    wallet: "none",
    auth: "none",
    interactive: true,
    promptHints: { label: "default-label" },
    summary: "Register a watch-only address (no secret)",
    fields: importWatchFields,
    input: importWatchFields,
    examples: [{ cmd: "wallet-cli import watch --address T... --label team-vault" }],
    formatText: TextFormatters.walletWatch,
    run: async (_ctx, _net, input) => {
      return wallets.importWatch(input.address, input.label)
    },
  } satisfies CommandDefinition)

  // ── list ─────────────────────────────────────────────────────────────────
  reg.add({
    path: ["list"],
    network: "none",
    wallet: "none",
    auth: "none",
    summary: "List wallets/accounts (no unlock needed)",
    fields: empty,
    input: empty,
    examples: [{ cmd: "wallet-cli list --output json" }],
    formatText: TextFormatters.walletList,
    run: async () => wallets.list(),
  } satisfies CommandDefinition)

  // ── use ──────────────────────────────────────────────────────────────────
  const setActiveFields = z.object({ account: z.string().min(1).describe("accountId, label, or address to make active for future commands") })
  reg.add({
    path: ["use"],
    network: "none",
    wallet: "none",
    auth: "none",
    positionals: [{ field: "account" }],
    summary: "Set the active account",
    fields: setActiveFields,
    input: setActiveFields,
    examples: [{ cmd: "wallet-cli use main" }],
    formatText: TextFormatters.walletUse,
    run: async (_ctx, _net, input) => {
      return wallets.use(input.account)
    },
  } satisfies CommandDefinition)

  // ── current ───────────────────────────────────────────────────────────────
  const currentFields = z.object({
    qr: z.boolean().default(false)
      .describe("render a terminal receive QR containing exactly the selected TRON address; text TTY only"),
  })
  reg.add({
    path: ["current"],
    network: "none",
    wallet: "optional",
    auth: "none",
    summary: "Show the current active account",
    description:
      "Show the selected account locally. --qr appends a scannable TRON receive-address QR in text mode without unlocking or accessing the network.",
    fields: currentFields,
    input: currentFields,
    examples: [
      { cmd: "wallet-cli current" },
      { cmd: "wallet-cli current --qr" },
      { cmd: "wallet-cli current --qr --account main" },
    ],
    formatText: TextFormatters.walletCurrent,
    run: async (context, _network, input) => {
      const descriptor = wallets.current(context.activeAccount)
      if (!input.qr || context.output !== "text") return descriptor
      const address = descriptor.addresses.tron
      if (!address) {
        throw new UsageError(
          "invalid_value",
          "selected account has no TRON receive address",
        )
      }
      const qr = services.qr?.encode(address) ?? null
      if (!qr) {
        context.warn(
          "terminal is non-interactive or too narrow for a complete QR code; showing the full address only",
        )
        return descriptor
      }
      return {
        ...descriptor,
        receiveQr: qr,
        receiveAddress: address,
      }
    },
  } satisfies CommandDefinition)

  // ── rename ────────────────────────────────────────────────────────────────
  const renameFields = z.object({
    account: z.string().min(1).describe("accountId, current label, or address to rename"),
    label: Schemas.label().describe("new unique label, 1-64 chars"),
  })
  reg.add({
    path: ["rename"],
    network: "none",
    wallet: "none",
    auth: "none",
    positionals: [{ field: "account" }],
    summary: "Rename an account label",
    fields: renameFields,
    input: renameFields,
    examples: [{ cmd: "wallet-cli rename main --label primary" }],
    formatText: TextFormatters.walletRename,
    run: async (_ctx, _net, input) => {
      return wallets.rename(input.account, input.label)
    },
  } satisfies CommandDefinition)

  // ── derive ────────────────────────────────────────────────────────────────
  // Wallet-level op: --seed-id picks the HD wallet directly by its seed id. No --account/active.
  const addAccountFields = z.object({
    seedId: z.string().min(1).describe("seed id (wlt_…) of the HD wallet to derive from — shown as the HD group header in `list`"),
    index: z.coerce.number().int().nonnegative().optional().describe("explicit HD account index, in account index; omit to use the next free index"),
    label: Schemas.label().optional().describe("label for the new derived account, 1-64 chars; omit to auto-generate <wallet-name>-<index>"),
  })
  reg.add({
    path: ["derive"],
    network: "none",
    wallet: "none",
    auth: "required",
    summary: "Derive the next HD account from a seed wallet (by --seed-id)",
    fields: addAccountFields,
    input: addAccountFields,
    examples: [{ cmd: "wallet-cli derive --seed-id wlt_ab12cd34" }],
    formatText: TextFormatters.walletDerive,
    run: async (_ctx, _net, input) => {
      return wallets.derive(input.seedId, input.index, input.label)
    },
  } satisfies CommandDefinition)

  // ── delete ────────────────────────────────────────────────────────────────
  const deleteFields = z.object({
    account: accountRef("account or wallet to delete, addressed by accountId, label, or address"),
    yes: z.boolean().default(false).describe("skip the interactive confirmation; required for non-TTY deletion"),
  })
  reg.add({
    path: ["delete"],
    network: "none",
    wallet: "none",
    auth: "none",
    interactive: true,
    positionals: [{ field: "account" }],
    summary: "Delete a wallet/account and clean orphan labels",
    fields: deleteFields,
    input: deleteFields,
    examples: [{ cmd: "wallet-cli delete old --yes" }],
    formatText: TextFormatters.walletDelete,
    run: async (ctx, _net, input) => {
      if (!input.yes) {
        if (!ctx.prompt.isTTY()) {
          throw new UsageError("tty_required", "deletion needs confirmation: pass --yes or run in a terminal")
        }
        const d = wallets.describe(input.account)
        const expect = d.label ?? d.accountId
        const kind = d.label ? "label" : "account"
        const ok = await ctx.prompt.confirm({ label: `Delete ${expect}? Type the exact ${kind} "${expect}" to confirm`, expect })
        if (!ok) throw new UsageError("aborted", "deletion not confirmed")
      }
      return wallets.delete(input.account)
    },
  } satisfies CommandDefinition)

  // ── backup ────────────────────────────────────────────────────────────────
  // Writes the secret + metadata to a 0600 FILE (never stdout/envelope): the secret stays off
  // screen, logs and AI context. stdout returns only metadata + the written path.
  // master password via dispatch prime (passwordMode: "verify"); --password-stdin is the non-interactive source.
  const backupFields = z.object({
    account: accountRef("account or wallet to export, addressed by accountId, label, or address"),
    out: z
      .string()
      .optional()
      .describe("output file path; omit to write <wallet-cli-root>/backups/<accountId>-<timestamp>.json; file is created with mode 0600 and never overwritten"),
  })
  reg.add({
    path: ["backup"],
    network: "none",
    wallet: "none",
    auth: "required",
    passwordMode: "verify",
    interactive: true,
    positionals: [{ field: "account" }],
    summary: "Export an account's secret + metadata to a 0600 file",
    fields: backupFields,
    input: backupFields,
    examples: [{ cmd: "wallet-cli backup main --out ~/main-backup.json --password-stdin" }],
    formatText: TextFormatters.walletBackup,
    run: async (_ctx, _net, input) => wallets.backup(input.account, input.out),
  } satisfies CommandDefinition)

  // ── change-password ───────────────────────────────────────────────────────
  // Verify old, prompt for the new one, confirm, then re-encrypt every software wallet keystore.
  // TTY-only (secretsTtyOnly): both passwords are entered interactively — no stdin source, no argv.
  // Sibling of `backup` — both are password-gated keystore secret operations.
  const changePasswordFields = z.object({
    yes: z.boolean().default(false)
      .describe("skip the confirmation prompt; required in non-TTY use"),
  })
  reg.add({
    path: ["change-password"],
    network: "none",
    wallet: "none",
    auth: "required",
    passwordMode: "verify",
    interactive: true,
    secretsTtyOnly: true,
    requires: ["the new master password — entered interactively in a TTY"],
    summary: "Change the master password (re-encrypt keystores)",
    description:
      "Change the master password. Re-encrypts every software wallet keystore with the\n" +
      "new password (Ledger / watch-only accounts are unaffected). Passwords are read\n" +
      "interactively from the TTY (hidden input); they never touch argv or stdin.",
    fields: changePasswordFields,
    input: changePasswordFields,
    examples: [{ cmd: "wallet-cli change-password" }],
    formatText: TextFormatters.passwordChanged,
    run: async (ctx, _net, input) => {
      // old password: already verified and primed by dispatch (passwordMode: "verify"), from the TTY.
      // secretsTtyOnly guarantees a TTY here (dispatch rejects --password-stdin / fails fast otherwise).
      const oldPassword = ctx.secrets.read("password")

      const newPassword = await ctx.prompt.hidden({
        label: "New master password (hidden)",
        confirm: true,
        confirmLabel: "Confirm new password",
        validate: (s) => { const e = passwordPolicyErrors(s); return e.length ? e.join("; ") : null },
      })
      if (newPassword === oldPassword) {
        throw new UsageError("invalid_value", "the new password must differ from the current one")
      }

      if (!input.yes) {
        if (!ctx.prompt.isTTY()) {
          throw new UsageError("tty_required", "password change needs confirmation: pass --yes or run in a terminal")
        }
        const count = countSoftwareWallets(wallets)
        const ok = await ctx.prompt.confirm({ label: `Re-encrypt ${count} software wallet(s) with the new password?` })
        if (!ok) throw new UsageError("aborted", "password change not confirmed")
      }
      return wallets.changePassword(oldPassword, newPassword)
    },
  } satisfies CommandDefinition)
}

/** distinct software (seed/privateKey) wallets — the N in the change-password confirm prompt. */
function countSoftwareWallets(wallets: WalletService): number {
  const ids = new Set(
    wallets.list()
      .filter((a) => a.type === "seed" || a.type === "privateKey")
      .map((a) => a.accountId.split(".")[0]),
  )
  return ids.size
}
