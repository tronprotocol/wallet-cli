/**
 * OutputFormatter (L2) — turn outcomes into result/event frame strings without changing
 * behavior. Instead of one class branching on `if (output === "json")`, this is an interface
 * with two implementations chosen by createOutputFormatter() (borrowed from ledger wallet-cli
 * output.ts). The formatter only computes strings; StreamManager owns writing & stream choice.
 *   - success → single terminal frame (caller hands to streams.result)
 *   - error   → terminal error (json envelope to stdout, or short stderr line)
 *   - event   → intermediate progress frame (caller hands to streams.event); null = not shown
 * JSON mode emits exactly one terminal envelope; empty data is {}; big numbers stay strings.
 * Neutral commands omit `chain` (修正⑥). (plan §3 L2 / §7.7)
 */
import type {
  CommandDefinition,
  NetworkDescriptor,
  OutputMode,
  ProgressEvent,
  StreamManager,
} from "../../core/types/index.js";
import type { CliError } from "../../core/errors/index.js";
import { OutputEnvelope, toJson } from "../../infra/contract/index.js";

export interface OutputFormatter {
  /** the single result frame for the caller to hand to streams.result(). */
  success(cmd: CommandDefinition, net: NetworkDescriptor | undefined, data: unknown): string;
  /** terminal error output (JSON envelope to stdout, or short line to stderr). */
  error(err: CliError, ctx?: { commandId?: string; net?: NetworkDescriptor }): void;
  /** intermediate progress frame for streams.event(); null = this mode does not show it. */
  event(e: ProgressEvent): string | null;
}

abstract class BaseOutputFormatter {
  constructor(
    protected readonly streams: StreamManager,
    protected readonly startedAt: number,
  ) {}

  protected meta() {
    return { durationMs: Date.now() - this.startedAt, warnings: this.streams.warnings() };
  }
}

class JsonOutputFormatter extends BaseOutputFormatter implements OutputFormatter {
  success(cmd: CommandDefinition, net: NetworkDescriptor | undefined, data: unknown): string {
    return toJson(OutputEnvelope.success(cmd, net, data, this.meta()));
  }

  error(err: CliError, ctx?: { commandId?: string; net?: NetworkDescriptor }): void {
    const env = OutputEnvelope.error(ctx?.commandId ?? "", ctx?.net, err.toEnvelope(), this.meta());
    this.streams.result(toJson(env));
  }

  event(e: ProgressEvent): string {
    return JSON.stringify(e);
  }
}

class HumanOutputFormatter extends BaseOutputFormatter implements OutputFormatter {
  success(cmd: CommandDefinition, net: NetworkDescriptor | undefined, data: unknown): string {
    const env = OutputEnvelope.success(cmd, net, data, this.meta());
    return renderText(env.command, net, env.data);
  }

  error(err: CliError): void {
    this.streams.errorLine(`error [${err.code}]: ${err.message}`);
  }

  event(e: ProgressEvent): string {
    return renderEvent(e);
  }
}

export function createOutputFormatter(
  output: OutputMode,
  streams: StreamManager,
  startedAt: number,
): OutputFormatter {
  return output === "json"
    ? new JsonOutputFormatter(streams, startedAt)
    : new HumanOutputFormatter(streams, startedAt);
}

// plain human progress line (no spinner / no TTY detection — 定案 A, Standard CLI / agent-first).
function renderEvent(e: ProgressEvent): string {
  switch (e.type) {
    case "awaiting_device":
      switch (e.reason) {
        case "sign": return "⧖ review and approve the transaction on your device";
        case "verify_address": return "⧖ review and confirm the address on your device";
        case "open_app": return "⧖ confirm on your device to open the app";
        case "unlock": return "⧖ unlock your device with your PIN";
      }
    // eslint-disable-next-line no-fallthrough
    case "pre-verify-address": return `compare with your device: ${e.address}`;
    case "signed": return "✓ signed; broadcasting…";
    case "broadcasting": return "broadcasting…";
    case "dry-run": return "dry run (transaction not broadcast)";
  }
}

function renderText(command: string, net: NetworkDescriptor | undefined, data: unknown): string {
  const walletFrame = renderWalletCommand(command, data);
  if (walletFrame) return walletFrame;

  const lines: string[] = [`✓ ${command}`];
  if (net) lines.push(`  network: ${net.aliases[0] ?? net.chainId} (${net.id})`);
  if (data && typeof data === "object" && !Array.isArray(data)) {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (Array.isArray(v) && v.length > 0) {
        lines.push(`  ${k}:`);
        for (const item of v) lines.push(`    - ${formatItem(item)}`);
      } else {
        lines.push(`  ${k}: ${stringifyValue(v)}`);
      }
    }
  } else if (data !== undefined && data !== null && !(typeof data === "object")) {
    lines.push(`  ${String(data)}`);
  } else if (Array.isArray(data)) {
    for (const item of data) lines.push(`  - ${formatItem(item)}`);
  }
  return lines.join("\n");
}

function renderWalletCommand(command: string, data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  switch (command) {
    case "wallet.create":
      return renderWalletCreated("Created", d, [
        "Recovery phrase is encrypted locally and was not printed.",
        "Run `wallet backup` soon and store the file offline.",
      ]);
    case "wallet.import-mnemonic":
      return renderWalletCreated("Imported", d, [
        "Recovery phrase was read from hidden input and was not printed.",
      ]);
    case "wallet.import-private-key":
      return renderWalletCreated("Imported", d, [
        "Private key was read from hidden input and was not printed.",
      ]);
    case "wallet.import-ledger":
      return renderLedgerImported(d);
    case "wallet.delete":
      return renderWalletDeleted(d);
    case "wallet.backup":
      return renderWalletBackup(d);
    default:
      return null;
  }
}

function renderWalletCreated(verb: "Created" | "Imported", d: Record<string, unknown>, notes: string[]): string {
  const name = displayName(d);
  const status = d.status === "existing" ? "Existing wallet" : `${verb} wallet`;
  const lines = [
    `${green("✓")} ${bold(status)} ${quote(name)}`,
    detail("Account", String(d.accountId ?? "")),
    detail("Type", typeLabel(d.type)),
    ...addressLines(d),
  ];
  if (d.active === true) lines.push(detail("Active", "yes"));
  lines.push("", ...notes.map((n) => `${yellow("!")} ${dim(n)}`));
  return compact(lines).join("\n");
}

function renderLedgerImported(d: Record<string, unknown>): string {
  const lines = [
    `${green("✓")} ${bold(d.status === "existing" ? "Existing Ledger account" : "Registered Ledger account")} ${quote(displayName(d))}`,
    detail("Account", String(d.accountId ?? "")),
    detail("App", String(d.family ?? "")),
    detail("Path", String(d.path ?? "")),
    ...addressLines(d),
    "",
    `${yellow("!")} ${dim("No private key is stored locally. Signing requires device confirmation.")}`,
  ];
  return compact(lines).join("\n");
}

function renderWalletDeleted(d: Record<string, unknown>): string {
  const secretRemoved = d.secretRemoved === true ? "yes" : "no";
  const lines = [
    `${green("✓")} ${bold("Deleted")} ${String(d.scope ?? "wallet")} ${String(d.accountId ?? "")}`,
    detail("Secret removed", secretRemoved),
    detail("New active", String(d.newActive ?? "none")),
  ];
  return compact(lines).join("\n");
}

function renderWalletBackup(d: Record<string, unknown>): string {
  const lines = [
    `${green("✓")} ${bold("Backup written")} ${String(d.out ?? "")}`,
    detail("Account", String(d.accountId ?? "")),
    detail("Secret", secretLabel(d.secretType)),
    detail("File mode", String(d.fileMode ?? "")),
    detail("Bytes", String(d.bytes ?? "")),
    "",
    `${yellow("!")} ${dim("Secret material was written only to the backup file, never to stdout.")}`,
  ];
  return compact(lines).join("\n");
}

function addressLines(d: Record<string, unknown>): string[] {
  const addresses = d.addresses;
  if (!addresses || typeof addresses !== "object" || Array.isArray(addresses)) return [];
  return Object.entries(addresses as Record<string, unknown>)
    .filter(([, address]) => typeof address === "string" && address.length > 0)
    .map(([family, address]) => detail(`${family} address`, shorten(String(address))));
}

function displayName(d: Record<string, unknown>): string {
  return String(d.label ?? d.accountId ?? "unnamed");
}

function typeLabel(v: unknown): string {
  switch (v) {
    case "seed": return "HD wallet (encrypted recovery phrase)";
    case "privateKey": return "Private key wallet (encrypted)";
    case "ledger": return "Ledger hardware account";
    case "watch": return "Watch-only account";
    default: return String(v ?? "");
  }
}

function secretLabel(v: unknown): string {
  switch (v) {
    case "mnemonic": return "recovery phrase";
    case "privateKey": return "private key";
    default: return String(v ?? "");
  }
}

function detail(label: string, value: string): string {
  if (!value) return "";
  return `  ${dim(label.padEnd(14))} ${value}`;
}

function quote(s: string): string {
  return `"${s}"`;
}

function shorten(s: string): string {
  if (s.length <= 24) return s;
  return `${s.slice(0, 10)}...${s.slice(-8)}`;
}

function compact(lines: string[]): string[] {
  return lines.filter((line, i, a) => line !== "" || (a[i - 1] !== "" && a[i + 1] !== ""));
}

/** an array element: {key, summary} descriptors read as "key — summary"; else fall back to JSON. */
function formatItem(item: unknown): string {
  if (item && typeof item === "object" && !Array.isArray(item) && "key" in item) {
    const o = item as { key: unknown; summary?: unknown };
    return o.summary ? `${o.key} — ${o.summary}` : String(o.key);
  }
  return stringifyValue(item);
}

function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function ansi(code: number, s: string): string {
  return process.env.NO_COLOR ? s : `\x1b[${code}m${s}\x1b[0m`;
}

function green(s: string): string { return ansi(32, s); }
function yellow(s: string): string { return ansi(33, s); }
function bold(s: string): string { return ansi(1, s); }
function dim(s: string): string { return ansi(2, s); }
