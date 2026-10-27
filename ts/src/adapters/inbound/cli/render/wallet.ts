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
    return receipt(
      ok(),
      `${d.status === "existing" ? "Selected existing account" : "Derived sub-account"} ${quote(displayName(d))}`,
      [
        ["Account ID", String(d.accountId ?? "")],
        ["Index", d.index === null || d.index === undefined ? "" : formatInt(d.index)],
        ...addressPairs(d),
        ["Active", d.active === true ? "yes" : ""],
        ["Note", "shares the wallet's recovery phrase"],
      ],
    );
  }) satisfies TextFormatter,
  walletDelete: ((data) => {
    const d = asObj(data);
    const scope = d.scope === "account" ? "account" : "wallet";
    return receipt(ok(), `Deleted ${scope} ${String(d.accountId ?? "")}`, [
      ["Secret removed", d.secretRemoved === false ? "no" : "yes"],
      ["New active", d.newActive ? String(d.newActive) : ""],
    ]);
  }) satisfies TextFormatter,
  walletBackup: ((data) => {
    const d = asObj(data);
    if (Array.isArray(d.records)) return renderBackupRecords(d);
    const keystore = d.format === "keystore";
    const noun = keystore ? "keystore" : "backup";
    return [
      receipt(warn(), `${keystore ? "Keystore" : "Backup"} written ${String(d.out ?? "")}`, [
        ["Account ID", String(d.accountId ?? "")],
        // Keystores export one family's key; mnemonic backups cover all families.
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

function renderWalletList(items: Obj[], family?: string): string {
  const shown = family ? items.filter((d) => addressFor(d, family) !== undefined) : items;
  if (shown.length === 0) return "No wallets found.";
  items = shown;
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

function nonEmptyAddressEntries(d: Obj): Pair[] {
  return Object.entries(asObj(d.addresses))
    .filter(([, address]) => typeof address === "string" && address.length > 0)
    .map(([family, address]) => [family, String(address)] as Pair);
}

function firstAddress(d: Obj): string {
  const first = nonEmptyAddressEntries(d)[0];
  return first ? first[1] : "";
}

function addressPairs(d: Obj): Pair[] {
  return nonEmptyAddressEntries(d).map(
    ([family, address]) => [familyAddressLabel(family), address] as Pair,
  );
}

function addressFor(d: Obj, family: string): string | undefined {
  const addresses = d.addresses as Record<string, unknown> | undefined;
  const value = addresses?.[family];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function typeLabel(v: unknown): string {
  return sourceLabel(v);
}

function renderBackupRecords(d: Obj): string {
  const records = (d.records as unknown[]).map(asObj);
  const page = asObj(d.pagination);
  const total = formatInt(page.total ?? records.length);
  const header = `Backup records (showing ${records.length} of ${total})`;
  if (records.length === 0) return `${header}\n  (none)`;
  return `${header}\n${table(
    ["Time (UTC)", "Exported account", "Operation", "File"],
    records.map((r) => [
      // Stored timestamps are UTC.
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
