/**
 * Wallet root commands — create/import/list/current/use/backup. Not chain-bound; no --network.
 * Calls WalletService rather than the transaction pipeline.
 */
import { existsSync } from "node:fs";
import { z } from "zod";
import type { CommandDefinition } from "../contracts/index.js";
import { Schemas } from "../schemas/index.js";
import { CommandRegistry } from "../registry/index.js";
import { accountRef, camelToKebab, ciEnum } from "../arity/index.js";
import type { LedgerDevice } from "../../../../application/ports/ledger-device.js";
import type { QrEncoder } from "../../../../application/ports/qr-encoder.js";
import type { WalletService } from "../../../../application/use-cases/wallet-service.js";
import {
  DEFAULT_SCAN_LIMIT,
  resolveLedgerPath,
  selectLedgerPath,
} from "../../../../application/services/ledger-account.js";
import { ChainFamily, CHAIN_FAMILIES, FAMILIES } from "../../../../domain/family/index.js";
import { UsageError } from "../../../../domain/errors/index.js";
import { passwordPolicyErrors } from "../input/prompt/validators.js";
import { readBoundedTextFile } from "./artifact.js";
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
const LEDGER_APPS = CHAIN_FAMILIES.map((f) => LEDGER_APP_BY_FAMILY[f]).filter(
  (a): a is string => a !== undefined,
) as [string, ...string[]];
export const walletImportLedgerFields = z.object({
  app: ciEnum(LEDGER_APPS).describe(
    // §3.6: the value is the app to open ON THE DEVICE, and what it selects is the account's
    // chain family — "address-derivation scheme" named the mechanism instead of the choice.
    "Ledger app to open on the device; selects the chain family",
  ),
  index: z.coerce
    .number()
    .int()
    .nonnegative()
    .optional()
    // NOT a zod .default(): §3.6 asks for the default in the `[optional, default: 0]` tag, but a
    // parsed default makes `index` always present, and the locator rule below counts PRESENCE —
    // `--path` alone would then read as two locators. The default stays in the description.
    .describe(
      "account index under the app's default path; omit with no --path/--address to use index 0; mutually exclusive with --path and --address",
    ),
  path: z
    .string()
    .optional()
    .describe("explicit derivation path; mutually exclusive with --index and --address"),
  address: z
    .string()
    .optional()
    .describe(
      "known address to locate by bounded scan; mutually exclusive with --index and --path",
    ),
  scanLimit: z.coerce
    .number()
    .int()
    .positive()
    // Declared from the service's own constant: `--json-schema` publishes what the schema says,
    // so a default living only in prose is one an agent has to read English to learn — and taking
    // the value from DEFAULT_SCAN_LIMIT keeps it one constant rather than a second copy.
    // (--index cannot do this: it counts as "given" once it has a default, which breaks the
    // --index/--path/--address exclusivity rule. This flag has no such constraint.)
    .default(DEFAULT_SCAN_LIMIT)
    .describe("how many indexes to scan when using --address"),
  label: Schemas.label()
    .optional()
    .describe("human-friendly unique account label, 1-64 chars; omit to auto-generate"),
});
/** --index / --path / --address are mutually exclusive (at most one locator). */
export const walletImportLedgerInput = walletImportLedgerFields.superRefine((v, c) => {
  const locators = [v.index !== undefined, v.path !== undefined, v.address !== undefined].filter(
    Boolean,
  ).length;
  if (locators > 1)
    c.addIssue({
      code: "custom",
      path: ["index"],
      message: "--index, --path and --address are mutually exclusive",
    });
});

// ── import keystore file reading ───────────────────────────────────────────────
// A V3 keystore is a small JSON document; the cap only exists to refuse a file that plainly is not
// one before it is read into memory.
const KEYSTORE_MAX_BYTES = 64 * 1024;

/** the parsed JSON of a keystore file. Distinguishes "no such file" from "not a keystore" so the
 *  caller learns which of the two mistakes they made. */
function readKeystoreFile(path: string): unknown {
  if (!existsSync(path)) throw new UsageError("keystore_not_found", `no keystore file at ${path}`);
  const raw = readBoundedTextFile(path, KEYSTORE_MAX_BYTES, "keystore file");
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new UsageError("invalid_keystore", `${path} is not valid JSON`);
  }
}

// ── backup --records time bounds ───────────────────────────────────────────────
// `YYYY-MM-DD` or `YYYY-MM-DD HH:mm:ss`, always read as UTC — the log is written in UTC, and a
// local-time reading would silently shift a boundary by the machine's offset. A bare date means that
// day's 00:00:00 (both bounds are inclusive instants, not day ranges).
const UTC_DATETIME = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/;

/** the ISO-8601 instant a bound denotes, or undefined when the bound was not given. */
function utcInstant(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const [, y, mo, d, h = "00", mi = "00", s = "00"] = UTC_DATETIME.exec(value)!;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
}

function utcDateTime(describe: string) {
  return z
    .string()
    .refine((v) => {
      const m = UTC_DATETIME.exec(v);
      if (!m) return false;
      // Reject impossible calendar values (2026-02-31, 25:00:00): Date normalises them silently, so
      // compare the round-trip instead of trusting the parse.
      const iso = utcInstant(v)!;
      const parsed = new Date(iso);
      return (
        !Number.isNaN(parsed.getTime()) && parsed.toISOString().replace(/\.\d{3}Z$/, "Z") === iso
      );
    }, "expected YYYY-MM-DD or 'YYYY-MM-DD HH:mm:ss' (UTC)")
    .optional()
    .describe(`${describe}; format YYYY-MM-DD or 'YYYY-MM-DD HH:mm:ss', parsed as UTC`);
}

export function registerWalletCommands(
  reg: CommandRegistry,
  services: {
    walletService: WalletService;
    ledger: LedgerDevice;
    qr?: QrEncoder;
  },
): void {
  const wallets = services.walletService;
  const empty = z.object({});

  // ── create ───────────────────────────────────────────────────────────────
  const createFields = z.object({
    label: Schemas.label()
      .optional()
      .describe("human-friendly unique account label, 1-64 chars; omit to auto-generate"),
  });
  reg.add({
    path: ["create"],
    network: "none",
    wallet: "none",
    auth: "required",
    passwordMode: "establish",
    interactive: true,
    promptHints: { label: "default-label" },
    summary: "Create a new HD wallet (BIP39 seed)",
    // §3.1: this release's headline is "one seed, an address per family" — and this is the
    // command that performs it, so its help has to say so.
    description:
      "Create a new HD wallet (BIP39 seed). Derives one address per chain family\n" +
      "from the same seed; the recovery phrase is encrypted locally and never printed.",
    fields: createFields,
    input: createFields,
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
  const importMnemonicFields = z.object({
    label: Schemas.label()
      .optional()
      .describe(
        "human-friendly unique account label, 1-64 chars; omit to auto-generate; the mnemonic is entered interactively (hidden)",
      ),
  });
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
      "Import a BIP39 mnemonic phrase. Derives one address per chain family from the same\n" +
      // §3.2's topic sentence. Its four siblings (create, derive, import private-key,
      // import watch) each say what they produce per family; silence here reads as "this one
      // does not".
      "seed, the same as `create`. The recovery phrase and master password are read\n" +
      "interactively from the TTY (hidden input); they never touch argv or stdin.",
    fields: importMnemonicFields,
    input: importMnemonicFields,
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
  const importPrivateKeyFields = z.object({
    label: Schemas.label()
      .optional()
      .describe(
        "human-friendly unique account label, 1-64 chars; omit to auto-generate; the private key is entered interactively (hidden)",
      ),
  });
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
      "interactively from the TTY (hidden input); they never touch argv or stdin.\n" +
      // §3.3 — and the fact that separates this from a seed import: ONE key, every family,
      // so the two addresses are two encodings of the same secret rather than two secrets.
      "One key yields an address on every chain family.",
    fields: importPrivateKeyFields,
    input: importPrivateKeyFields,
    examples: [{ cmd: "wallet-cli import private-key --label hot" }],
    formatText: TextFormatters.walletCreated("Imported", [
      "Private key was read from hidden input and was not printed.",
    ]),
    run: async (ctx, _net, input) => {
      const secret = await ctx.secrets.resolveSecret("privateKey");
      return wallets.importPrivateKey(secret, input.label);
    },
  } satisfies CommandDefinition);

  // ── import keystore ───────────────────────────────────────────────────────
  // Two independent passwords, both hidden-TTY-only: the FILE's own password (to decrypt it) and our
  // master password (to re-encrypt it locally). The file is read and structurally validated before
  // EITHER password prompt, so a typo'd path costs no password typing — hence no `passwordMode`
  // (which would prime the master password up in the shell, ahead of `run`); priming happens inside
  // `run`, after the file (same reasoning as `backup`). Do not "restore" passwordMode here.
  // The shell's secretsTtyOnly gate still runs first and reports tty_required without a terminal —
  // correct, and uniform with the other TTY-only commands: there is no prompt to save there.
  const importKeystoreFields = z.object({
    path: z.string().min(1).describe("path to the keystore JSON file"),
    label: Schemas.label()
      .optional()
      .describe("human-friendly unique account label, 1-64 chars; omit to auto-generate"),
  });
  reg.add({
    path: ["import", "keystore"],
    network: "none",
    wallet: "none",
    auth: "required",
    interactive: true,
    secretsTtyOnly: true,
    positionals: [{ field: "path" }],
    promptHints: { label: "default-label" },
    requires: ["the keystore file's own password — entered interactively in a TTY"],
    summary: "Import a Web3 keystore file",
    description:
      "Import a single account from a standard Web3 keystore JSON (as exported by TronLink or\n" +
      "'backup --keystore'), stored encrypted under your master password and made active. It carries\n" +
      "one private key, so nothing can be derived from it; a same-address account is refused with\n" +
      "account_exists (delete it first).\n\n" +
      "Interactive-only: the master password and the keystore's own password are entered only via\n" +
      "hidden TTY prompts, never stdin/argv — without a TTY it fails with tty_required.",
    fields: importKeystoreFields,
    input: importKeystoreFields,
    examples: [
      { cmd: "wallet-cli import keystore ./tronlink-export.json" },
      { cmd: "wallet-cli import keystore ./tronlink-export.json --label imported" },
    ],
    formatText: TextFormatters.walletCreated("Imported", [
      "The keystore password was read from hidden input and was not printed.",
    ]),
    run: async (ctx, _net, input) => {
      const file = readKeystoreFile(input.path);
      const mode = wallets.isInitialized() ? "verify" : "set";
      await ctx.secrets.primePassword({ mode, verify: (pw) => wallets.verifyPassword(pw) });
      const keystorePassword = await ctx.prompt.hidden({
        label: "Keystore file password (hidden)",
      });
      return wallets.importKeystore(file, keystorePassword, input.label);
    },
  } satisfies CommandDefinition);

  // ── import ledger ─────────────────────────────────────────────────────────
  reg.add({
    path: ["import", "ledger"],
    network: "none",
    wallet: "none",
    auth: "none",
    interactive: true,
    promptHints: {
      label: "default-label",
      index: "skip",
      path: "skip",
      address: "skip",
      scanLimit: "skip",
    },
    requires: ["a connected, unlocked Ledger with the selected app (--app) open"],
    summary: "Register a Ledger account",
    fields: walletImportLedgerFields,
    input: walletImportLedgerInput,
    examples: [
      { cmd: "wallet-cli import ledger --app tron --index 0 --label cold" },
      { cmd: "wallet-cli import ledger --app ethereum --index 0 --label cold-evm" },
    ],
    formatText: TextFormatters.walletLedger,
    run: async (ctx, _net, input) => {
      const family: ChainFamily = FAMILY_BY_LEDGER_APP[input.app]!;
      const hasLocator =
        input.index !== undefined || input.path !== undefined || input.address !== undefined;
      const path =
        hasLocator || !ctx.prompt.isTTY()
          ? await resolveLedgerPath(services.ledger, family, input)
          : await selectLedgerPath(services.ledger, family, ctx.prompt);
      ctx.emit({ type: "deriving-address" });
      return wallets.importLedger(family, path, input.label);
    },
  } satisfies CommandDefinition);

  // ── import watch ──────────────────────────────────────────────────────────
  const importWatchFields = z.object({
    address: z
      .string()
      .min(1)
      .describe(
        "watch-only address to track; TRON base58 (T...) or EVM hex (0x...), detected from the value",
      ),
    label: Schemas.label()
      .optional()
      .describe("human-friendly unique account label, 1-64 chars; omit to auto-generate"),
  });
  reg.add({
    path: ["import", "watch"],
    network: "none",
    wallet: "none",
    auth: "none",
    interactive: true,
    promptHints: { label: "default-label" },
    summary: "Register a watch-only address",
    // §3.5: the family is inferred from the address, and that is what limits where the account
    // can be used — neither fact is guessable from "register a watch-only address".
    description:
      "Register a watch-only address (no secret). The chain family is detected from the\n" +
      "address format; the account is usable only on networks of that family.",
    fields: importWatchFields,
    input: importWatchFields,
    examples: [{ cmd: "wallet-cli import watch --address T... --label team-vault" }],
    formatText: TextFormatters.walletWatch,
    run: async (_ctx, _net, input) => {
      return wallets.importWatch(input.address, input.label);
    },
  } satisfies CommandDefinition);

  // ── list ─────────────────────────────────────────────────────────────────
  reg.add({
    path: ["list"],
    // The network is a DISPLAY SELECTOR, not a target: no node is contacted. `wallet: "none"`
    // means the resolver skips its single-family ACCOUNT check, which would otherwise refuse to
    // list anything whenever the active account's family differed from the network.
    network: "optional",
    wallet: "none",
    auth: "none",
    summary: "List wallets/accounts (no unlock needed)",
    description:
      "List every local account, grouped by HD seed and by type. The address column shows the " +
      "family of the selected network (--network, else config.defaultNetwork); JSON output " +
      "always carries every family's address.",
    fields: empty,
    input: empty,
    examples: [
      { cmd: "wallet-cli list" },
      { cmd: "wallet-cli list --network sepolia" },
      { cmd: "wallet-cli list --output json" },
    ],
    formatText: TextFormatters.walletList,
    run: async (context, network) => {
      const accounts = wallets.list();
      // The text table is filtered to one family; say so, or a user whose only hardware account
      // is on the other chain sees an empty list with no hint that --network would reveal it.
      // json is unfiltered, so a warning there would be noise about nothing.
      if (context.output === "text" && network) {
        const hidden = accounts.filter((a) => !a.addresses[network.family]).length;
        if (hidden > 0) {
          context.warn(
            `${hidden} account(s) have no ${network.family} address and are not shown; ` +
              "use --network to switch, or --output json to see every family",
          );
        }
      }
      return accounts;
    },
  } satisfies CommandDefinition);

  // ── use ──────────────────────────────────────────────────────────────────
  const setActiveFields = z.object({
    account: z
      .string()
      .min(1)
      .describe("accountId, label, or address to make active for future commands"),
  });
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
      return wallets.use(input.account);
    },
  } satisfies CommandDefinition);

  // ── current ───────────────────────────────────────────────────────────────
  const currentFields = z.object({
    qr: z
      .boolean()
      .default(false)
      .describe(
        "render a terminal receive QR containing exactly the receive address for the selected network; text TTY only",
      ),
  });
  reg.add({
    path: ["current"],
    // Safe now that the target resolver no longer judges the account against the network: this
    // command must always be able to SHOW an account, whatever chain it lives on. The network
    // only decides which family's address --qr encodes.
    network: "optional",
    wallet: "optional",
    auth: "none",
    summary: "Show the current active account",
    description:
      "Show the selected account locally, with one address line per chain family it has. --qr " +
      "appends a scannable receive-address QR in text mode, for the family of the selected " +
      "network (--network, else config.defaultNetwork) — without unlocking or accessing the network.",
    fields: currentFields,
    input: currentFields,
    examples: [
      { cmd: "wallet-cli current" },
      { cmd: "wallet-cli current --qr" },
      { cmd: "wallet-cli current --qr --account main" },
      { cmd: "wallet-cli current --qr --network sepolia" },
    ],
    formatText: TextFormatters.walletCurrent,
    run: async (context, network, input) => {
      const descriptor = wallets.current(context.activeAccount);
      if (!input.qr) return descriptor;
      // The network is a DISPLAY SELECTOR here, not a target: this command performs no chain I/O,
      // so it stays `network: "none"` and resolves lazily, only for --qr. That keeps a plain
      // `current` working for an account whose family does not match the active network — you
      // must always be able to look at your own account.
      const address = network ? descriptor.addresses[network.family] : undefined;
      if (!address) {
        // Deliberately no fallback to whichever family the account does have: a receive QR for
        // the wrong chain is scanned, paid into, and lost.
        throw new UsageError(
          "family_mismatch",
          `selected account has no ${network?.family} address; ${network?.id} cannot receive to it`,
        );
      }
      // The check above runs whatever the output format is (§3.8 lists this error with no
      // "text only" clause): `-o json` is a different RENDERING of the same run, not a different
      // meaning, and the same command answering "cannot receive here" to a human and "success" to
      // an agent is the worse of the two lies. Only the QR itself is text-shaped, so json gets the
      // address it asked for and no picture.
      if (context.output !== "text") return { ...descriptor, receiveAddress: address };
      const qr = services.qr?.encode(address) ?? null;
      if (!qr) {
        context.warn(
          "terminal is non-interactive or too narrow for a complete QR code; showing the full address only",
        );
        return descriptor;
      }
      return {
        ...descriptor,
        receiveQr: qr,
        receiveAddress: address,
      };
    },
  } satisfies CommandDefinition);

  // ── rename ────────────────────────────────────────────────────────────────
  const renameFields = z.object({
    account: z.string().min(1).describe("accountId, current label, or address to rename"),
    label: Schemas.label().describe("new unique label, 1-64 chars"),
  });
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
      return wallets.rename(input.account, input.label);
    },
  } satisfies CommandDefinition);

  // ── derive ────────────────────────────────────────────────────────────────
  // Wallet-level op: --seed-id picks the HD wallet directly by its seed id. No --account/active.
  const addAccountFields = z.object({
    seedId: z
      .string()
      .min(1)
      .describe(
        "seed id (wlt_…) of the HD wallet to derive from — shown as the HD group header in `list`",
      ),
    index: z.coerce
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("explicit HD account index, in account index; omit to use the next free index"),
    label: Schemas.label()
      .optional()
      .describe(
        "label for the new derived account, 1-64 chars; omit to auto-generate <wallet-name>-<index>",
      ),
  });
  reg.add({
    path: ["derive"],
    network: "none",
    wallet: "none",
    auth: "required",
    summary: "Derive the next HD account from a seed wallet (by --seed-id)",
    // §3.9, minus its `--path` sentence (that flag is not in this release — see ADR-0009).
    description:
      "Derive the next HD account from a seed wallet (by --seed-id). Each family uses\n" +
      "its own BIP44 template, so one derive yields an address per family.",
    fields: addAccountFields,
    input: addAccountFields,
    examples: [{ cmd: "wallet-cli derive --seed-id wlt_ab12cd34" }],
    formatText: TextFormatters.walletDerive,
    run: async (_ctx, _net, input) => {
      return wallets.derive(input.seedId, input.index, input.label);
    },
  } satisfies CommandDefinition);

  // ── delete ────────────────────────────────────────────────────────────────
  const deleteFields = z.object({
    account: accountRef("account or wallet to delete, addressed by accountId, label, or address"),
    yes: z
      .boolean()
      .default(false)
      .describe("skip the interactive confirmation; required for non-TTY deletion"),
  });
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
          throw new UsageError(
            "tty_required",
            "deletion needs confirmation: pass --yes or run in a terminal",
          );
        }
        const d = wallets.describe(input.account);
        const expect = d.label ?? d.accountId;
        const kind = d.label ? "label" : "account";
        const ok = await ctx.prompt.confirm({
          label: `Delete ${expect}? Type the exact ${kind} "${expect}" to confirm`,
          expect,
        });
        if (!ok) throw new UsageError("aborted", "deletion not confirmed");
      }
      return wallets.delete(input.account);
    },
  } satisfies CommandDefinition);

  // ── backup ────────────────────────────────────────────────────────────────
  // Writes the secret + metadata to a 0600 FILE (never stdout/envelope): the secret stays off
  // screen, logs and AI context. stdout returns only metadata + the written path.
  // The master password is primed by `run` itself, not by dispatch (no passwordMode): the account
  // must be known to be exportable BEFORE a password is demanded. A Ledger/watch account holds no
  // secret, and a Ledger-only keystore may have no master password at all — verifying against a
  // missing sentinel always fails, so a dispatch-level gate would trap the user on a prompt no
  // answer satisfies instead of telling them the account simply cannot be exported.
  // --password-stdin remains the non-interactive source.
  const backupFields = z.object({
    account: accountRef(
      "account or wallet to export, addressed by accountId, label, or address; with --records, the account whose exports to list",
      { optional: true },
    ),
    keystore: z
      .boolean()
      .default(false)
      .describe(
        "export as a standard Web3 keystore JSON (importable by TronLink and others, encrypted with your master password) instead of the native format",
      ),
    out: z
      .string()
      .optional()
      .describe(
        "output file path; omit to write ./<accountId>-<timestamp>.json in the current directory (.keystore.json with --keystore); file is created with mode 0600 and never overwritten",
      ),
    records: z
      .boolean()
      .default(false)
      .describe("list past secret exports instead of exporting anything"),
    from: utcDateTime("with --records: only records at or after this UTC time"),
    to: utcDateTime("with --records: only records at or before this UTC time"),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe("with --records: maximum records to return; omit for all"),
    // Optional, not .default(0): a default makes "not given" indistinguishable from "given as 0"
    // in the refine below, which is how --offset alone slipped past the --records guard. The 0
    // lives in backupRecords (query.offset ?? 0), so the emitted pagination is unchanged.
    offset: z.coerce.number().int().min(0).optional().describe("with --records: pagination offset"),
  });
  const RECORD_FILTERS = ["from", "to", "limit", "offset"] as const;
  const backupInput = backupFields.superRefine((v, c) => {
    if (v.records) {
      // --keystore/--out describe an export; --records exports nothing, so accepting them would
      // silently ignore what the caller asked for.
      for (const flag of ["keystore", "out"] as const) {
        if (v[flag] !== undefined && v[flag] !== false) {
          c.addIssue({
            code: "custom",
            path: [flag],
            message: `--${camelToKebab(flag)} exports a file; it cannot be combined with --records`,
          });
        }
      }
      return;
    }
    if (v.account === undefined) {
      c.addIssue({
        code: "custom",
        path: ["account"],
        message: "an account is required unless --records is given",
      });
    }
    for (const flag of RECORD_FILTERS) {
      if (v[flag] !== undefined) {
        c.addIssue({
          code: "custom",
          path: [flag],
          message: `--${flag} filters the export log; it needs --records`,
        });
      }
    }
  });
  reg.add({
    path: ["backup"],
    // The network selects WHICH key `--keystore` exports (a seed account holds one per family),
    // not a chain to contact. Safe as "optional" because `wallet: "none"` keeps the resolver's
    // single-family ACCOUNT check out of the way.
    network: "optional",
    wallet: "none",
    auth: "required",
    interactive: true,
    positionals: [{ field: "account" }],
    summary: "Export an account's secret (native or --keystore); audit exports with --records",
    description:
      "Export an account's secret to a 0600 file — the native backup format, or a standard Web3\n" +
      "keystore JSON with --keystore (importable by TronLink and others, encrypted with your master\n" +
      "password). A keystore holds a single private key, so an HD account exports only its current\n" +
      "derived key; use the native backup to move a whole seed.\n\n" +
      "The secret is written only to the file, never to stdout; watch-only and Ledger accounts have\n" +
      "none to export. Files default to the CURRENT DIRECTORY — do not run this in a shared directory\n" +
      "or a git repository.\n\n" +
      "With --records and no account, nothing is exported: it shows the local audit log of past\n" +
      "exports instead — one row per 'backup' and 'backup --keystore', newest first, with the file\n" +
      "each secret went to. Imports are not logged. The log keeps the most recent 1000 entries.",
    fields: backupFields,
    input: backupInput,
    // Log filters are never interrogated — a listing is meant to be re-run with a narrower flag, not
    // negotiated one prompt at a time.
    promptHints: { from: "skip", to: "skip", limit: "skip", offset: "skip" },
    // --records audits: nothing is exported, so there is no account to pick and no file to name.
    skipGapFill: (argv) => (argv.records ? ["account", "out"] : []),
    commandIdFor: (input) => (input.records ? "backup.records" : "backup"),
    examples: [
      { cmd: "wallet-cli backup main --out ~/main-backup.json --password-stdin" },
      { cmd: "wallet-cli backup main --keystore --password-stdin" },
      { cmd: "wallet-cli backup --records --limit 20" },
      { cmd: "wallet-cli backup --records --account main --from 2026-08-01" },
    ],
    formatText: TextFormatters.walletBackup,
    run: async (ctx, network, input) => {
      if (input.records) {
        return wallets.backupRecords({
          from: utcInstant(input.from),
          to: utcInstant(input.to),
          limit: input.limit,
          offset: input.offset,
          account: input.account,
        });
      }
      const account = input.account!; // guaranteed by backupInput's refine
      wallets.assertExportable(account);
      await ctx.secrets.primePassword({
        mode: "verify",
        verify: (pw) => wallets.verifyPassword(pw),
      });
      // A keystore holds ONE private key, and a seed account has a different one per family
      // (§1.2). The selected network picks which — `family` is never exposed as a flag; the
      // network is the one selector users learn. The receipt echoes it, so an export that fell
      // back to config.defaultNetwork still says out loud which key it wrote.
      return input.keystore
        ? wallets.backupKeystore(
            account,
            input.out,
            ctx.secrets.read("password"),
            (network ?? ctx.networkRegistry.resolveDefault()).family,
          )
        : wallets.backup(account, input.out);
    },
  } satisfies CommandDefinition);

  // ── change-password ───────────────────────────────────────────────────────
  // Verify old, prompt for the new one, confirm, then re-encrypt every software wallet keystore.
  // TTY-only (secretsTtyOnly): both passwords are entered interactively — no stdin source, no argv.
  // Sibling of `backup` — both are password-gated keystore secret operations.
  const changePasswordFields = z.object({
    yes: z
      .boolean()
      .default(false)
      .describe("skip the confirmation prompt; required in non-TTY use"),
  });
  reg.add({
    path: ["change-password"],
    network: "none",
    wallet: "none",
    auth: "required",
    passwordMode: "verify",
    interactive: true,
    secretsTtyOnly: true,
    // The prompt order is current-then-new, and §10.1 rule 4 makes Requires follow the order the
    // user actually types. The generated line covers the current password, so the new one has to
    // come after it.
    requiresAfterAuth: ["the new master password — entered interactively in a TTY"],
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
      const oldPassword = ctx.secrets.read("password");

      const newPassword = await ctx.prompt.hidden({
        label: "New master password (hidden)",
        confirm: true,
        confirmLabel: "Confirm new password",
        validate: (s) => {
          const e = passwordPolicyErrors(s);
          return e.length ? e.join("; ") : null;
        },
      });
      if (newPassword === oldPassword) {
        throw new UsageError("invalid_value", "the new password must differ from the current one");
      }

      if (!input.yes) {
        if (!ctx.prompt.isTTY()) {
          throw new UsageError(
            "tty_required",
            "password change needs confirmation: pass --yes or run in a terminal",
          );
        }
        const count = countSoftwareWallets(wallets);
        const ok = await ctx.prompt.confirm({
          label: `Re-encrypt ${count} software wallet(s) with the new password?`,
        });
        if (!ok) throw new UsageError("aborted", "password change not confirmed");
      }
      return wallets.changePassword(oldPassword, newPassword);
    },
  } satisfies CommandDefinition);
}

/** distinct software (seed/privateKey) wallets — the N in the change-password confirm prompt. */
function countSoftwareWallets(wallets: WalletService): number {
  const ids = new Set(
    wallets
      .list()
      .filter((a) => a.type === "seed" || a.type === "privateKey")
      .map((a) => a.accountId.split(".")[0]),
  );
  return ids.size;
}
