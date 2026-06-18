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
