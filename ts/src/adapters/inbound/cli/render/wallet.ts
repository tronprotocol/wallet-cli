import type { TextFormatter } from "../contracts/index.js";
import { sourceLabel } from "../../../../domain/sources/index.js";
import { formatInt, quote, shorten } from "./scalars.js";
import { type Obj, type Pair, asObj, receipt, table, titled, ok, warn } from "./layout.js";
import { familyAddressLabel } from "./family.js";

export const WalletFormatters = {
  walletCreated:
    (verb: "Created" | "Imported", notes: string[]): TextFormatter =>
    (data) =>
      renderWalletCreated(verb, asObj(data), notes),
  walletWatch: ((data) => {
    const d = asObj(data);
    return receipt(ok(), `Added watch-only account ${quote(displayName(d))}`, [
      // The family label, not a bare `Address` (§3.5): once two families coexist, "Address" does
      // not tell the reader which chain this account lives on.
      ...addressPairs(d),
      ["Note", "read-only; signing operations will be rejected"],
    ]);
  }) satisfies TextFormatter,
  walletLedger: ((data) => renderLedgerImported(asObj(data))) satisfies TextFormatter,
  walletList: ((data, ctx) =>
    renderWalletList(
      Array.isArray(data) ? data.map(asObj) : [],
      ctx?.net?.family,
    )) satisfies TextFormatter,
  walletUse: ((data) => {
    const d = asObj(data);
    return receipt(ok(), `Active account: ${displayName(d)}`, addressPairs(d));
  }) satisfies TextFormatter,
  walletCurrent: ((data) => {
    const d = asObj(data);
    const identity = titled(
      `${d.active === true ? "Active" : "Selected"} account: ${displayName(d)}`,
      addressPairs(d),
    );
    return d.receiveQr
      ? `${identity}\n\n${String(d.receiveQr)}\nReceive address  ${String(d.receiveAddress ?? "")}`
      : identity;
  }) satisfies TextFormatter,
  walletRename: ((data) => {
    const d = asObj(data);
    return receipt(ok(), "Renamed account", [
      ["Old label", String(d.previousLabel ?? "")],
      ["New label", displayName(d)],
    ]);
  }) satisfies TextFormatter,
  walletDerive: ((data) => {
    const d = asObj(data);
    // One derive produces an address per family (§3.9), so the receipt lists every one of them —
    // showing only the first made this release's headline invisible on the command that performs
    // it. `Index` and `Account ID` come along for the same reason `create` carries them: they are
    // what the next command is addressed by.
    return receipt(ok(), `Derived sub-account ${quote(displayName(d))}`, [
      ["Account ID", String(d.accountId ?? "")],
      ["Index", d.index === null || d.index === undefined ? "" : formatInt(d.index)],
      ...addressPairs(d),
      ["Active", d.active === true ? "yes" : ""],
      ["Note", "shares master mnemonic; no separate backup needed"],
    ]);
  }) satisfies TextFormatter,
  walletDelete: ((data) => {
    const d = asObj(data);
    const scope = d.scope === "account" ? "account" : "wallet";
    return receipt(ok(), `Deleted ${scope} ${String(d.accountId ?? "")}`, [
      ["Secret removed", d.secretRemoved === false ? "no" : "yes"],
      ["New active", d.newActive ? String(d.newActive) : ""],
    ]);
  }) satisfies TextFormatter,
  // One command, two shapes: an export receipt, or the audit log when --records was given. They are
  // told apart by `records` rather than by the command id, which the envelope carries separately.
  walletBackup: ((data) => {
    const d = asObj(data);
    if (Array.isArray(d.records)) return renderBackupRecords(d);
    const keystore = d.format === "keystore";
    const noun = keystore ? "keystore" : "backup";
    return [
      receipt(warn(), `${keystore ? "Keystore" : "Backup"} written ${String(d.out ?? "")}`, [
        ["Account ID", String(d.accountId ?? "")],
        // Only for a keystore: it holds ONE key, and a seed account has one per family, so the
        // receipt must say which was written — the choice may have come from defaultNetwork.
        // A mnemonic covers every family, so a row there would imply a choice never made.
        ...(keystore && d.family ? [["Family", String(d.family)] as Pair] : []),
        ["Secret", secretLabel(d.secretType)],
        ["File mode", String(d.fileMode ?? "0600")],
        ["Bytes", String(d.bytes ?? "?")],
      ]),
      "",
      `${warn()} Secret material was written only to the ${noun} file, never to stdout.`,
    ].join("\n");
  }) satisfies TextFormatter,
  passwordChanged: ((data) => {
    const d = asObj(data);
    const list = Array.isArray(d.wallets) ? d.wallets.map(String).join(", ") : "";
    return receipt(
      ok(),
      `Master password changed — re-encrypted ${String(d.count ?? 0)} software wallet(s)`,
      [
        ["Wallets", list],
        ["Note", "Ledger / watch-only accounts are unaffected"],
      ],
    );
  }) satisfies TextFormatter,
};

function renderWalletCreated(verb: "Created" | "Imported", d: Obj, notes: string[]): string {
  const existing = d.status === "existing";
  const title = existing ? "Existing wallet" : `${verb} wallet`;
  const lines = [
    receipt(existing ? warn() : ok(), `${title} ${quote(displayName(d))}`, [
      ["Account ID", String(d.accountId ?? "")],
      ["Type", typeLabel(d.type)],
      ...addressPairs(d),
      ["Active", d.active === true ? "yes" : ""],
    ]),
  ];
  if (notes.length) lines.push("", ...notes.map((n) => `${warn()} ${n}`));
  return lines.join("\n");
}

function renderLedgerImported(d: Obj): string {
  const existing = d.status === "existing";
  return [
    receipt(
      existing ? warn() : ok(),
      `${existing ? "Existing Ledger account" : "Registered Ledger account"} ${quote(displayName(d))}`,
      [
        ["Account ID", String(d.accountId ?? "")],
        ["App", String(d.family ?? "")],
        ["Path", String(d.path ?? "")],
        ...addressPairs(d),
      ],
    ),
    "",
    `${warn()} No private key is stored locally. Signing requires device confirmation.`,
  ].join("\n");
}

/** Tree view: each seed wallet is a group headed by its seed id (the `--seed` handle for `derive`),
 *  its accounts listed under `├─/└─` connectors as `[index] label`. Non-HD accounts group by type.
 *  Plain text only — the text-mode frame is control-byte-stripped (CLI-OUT-001) so ANSI colour
 *  can't survive here anyway; the active account is marked with a trailing `(active)`. */
function renderWalletList(items: Obj[], family?: string): string {
  // One family at a time (§3.7): showing both side by side doubles the table's width, and the
  // user only cares about the chain they are on. An account with no address in this family is
  // dropped rather than given an empty row — json still carries every family.
  const shown = family ? items.filter((d) => addressFor(d, family) !== undefined) : items;
  if (shown.length === 0) return "No wallets found.";
  items = shown;
  // group seeds by their seed id (wlt_x); non-HD accounts by type. Insertion order preserved.
  const groups = new Map<string, { hd: boolean; header: string; rows: Obj[] }>();
  for (const d of items) {
    const isSeed = d.type === "seed";
    const seedId = String(d.accountId ?? "").split(".")[0] ?? "";
    const key = isSeed ? `hd:${seedId}` : `type:${String(d.type)}`;
    const header = isSeed ? `HD  ${seedId}` : typeLabel(d.type);
    (groups.get(key) ?? groups.set(key, { hd: isSeed, header, rows: [] }).get(key)!).rows.push(d);
  }
  const leftOf = (d: Obj): string =>
    d.type === "seed" ? `[${d.index ?? "?"}] ${displayName(d)}` : displayName(d);
  const leftW = Math.max(...items.map((d) => leftOf(d).length));
  const addressOf = (d: Obj): string => (family ? (addressFor(d, family) ?? "") : firstAddress(d));
  const addrW = Math.max(...items.map((d) => addressOf(d).length));
  const row = (d: Obj, last: boolean): string =>
    `${last ? "└─ " : "├─ "}${leftOf(d).padEnd(leftW)}  ${addressOf(d).padEnd(addrW)}  ${d.active ? "(active)" : ""}`.replace(
      /\s+$/,
      "",
    );
  const blocks: string[] = [];
  for (const g of groups.values()) {
    const rows = g.hd ? [...g.rows].sort((a, b) => Number(a.index) - Number(b.index)) : g.rows;
    blocks.push([g.header, ...rows.map((d, i) => row(d, i === rows.length - 1))].join("\n"));
  }
  return blocks.join("\n\n");
}

function displayName(d: Obj): string {
  return String(d.label ?? d.accountId ?? d.id ?? "unnamed");
}

/** non-empty address entries — drops families whose address is blank/absent. */
function nonEmptyAddressEntries(d: Obj): Pair[] {
  return Object.entries(asObj(d.addresses))
    .filter(([, address]) => typeof address === "string" && address.length > 0)
    .map(([family, address]) => [family, String(address)] as Pair);
}

function firstAddress(d: Obj): string {
  const first = nonEmptyAddressEntries(d)[0];
  return first ? first[1] : "";
}

/** per-family address field pairs, addresses shown in full (§0.4 ②). */
function addressPairs(d: Obj): Pair[] {
  return nonEmptyAddressEntries(d).map(
    ([family, address]) => [familyAddressLabel(family), address] as Pair,
  );
}

/** this account's address in one family, or undefined when it has none there. */
function addressFor(d: Obj, family: string): string | undefined {
  const addresses = d.addresses as Record<string, unknown> | undefined;
  const value = addresses?.[family];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function typeLabel(v: unknown): string {
  return sourceLabel(v);
}

/** The export audit log: newest first, UTC, one row per past export and the file it went to. */
function renderBackupRecords(d: Obj): string {
  const records = (d.records as unknown[]).map(asObj);
  const page = asObj(d.pagination);
  const total = formatInt(page.total ?? records.length);
  const header = `Backup records (showing ${records.length} of ${total})`;
  if (records.length === 0) return `${header}\n  (none)`;
  return `${header}\n${table(
    ["Time (UTC)", "Exported account", "Operation", "File"],
    records.map((r) => [
      // The stored instant is second-precision UTC; minutes are enough to read a trail by.
      String(r.timestamp ?? "")
        .replace("T", " ")
        .slice(0, 16),
      r.label
        ? `${shorten(String(r.account ?? ""))} (${String(r.label)})`
        : shorten(String(r.account ?? "")),
      String(r.operation ?? ""),
      String(r.out ?? ""),
    ]),
  )}`;
}

function secretLabel(v: unknown): string {
  switch (v) {
    case "mnemonic":
      return "recovery phrase";
    case "privateKey":
      return "private key";
    default:
      return String(v ?? "secret");
  }
}
