/**
 * OutputFormatter (L2) — turn outcomes into result/diagnostic strings without changing
 * behavior. JSON mode emits exactly one envelope; empty data is {}; big numbers stay strings.
 * Neutral commands omit `chain` (修正⑥). (plan §3 L2 / §7.7)
 */
import type {
  CommandDefinition,
  NetworkDescriptor,
  OutputMode,
  StreamManager,
} from "../types/index.js";
import type { CliError } from "../errors/index.js";
import { OutputEnvelope, toJson } from "../contract/index.js";

export class OutputFormatter {
  constructor(
    private readonly streams: StreamManager,
    private readonly output: OutputMode,
    private readonly startedAt: number,
  ) {}

  #meta() {
    return { durationMs: Date.now() - this.startedAt, warnings: this.streams.warnings() };
  }

  /** returns the single result frame for the caller to hand to streams.result(). */
  success(cmd: CommandDefinition, net: NetworkDescriptor | undefined, data: unknown): string {
    const env = OutputEnvelope.success(cmd, net, data, this.#meta());
    if (this.output === "json") return toJson(env);
    return renderText(env.command, net, env.data);
  }

  /** terminal error output (JSON envelope to stdout, or short line to stderr). */
  error(err: CliError, ctx?: { commandId?: string; net?: NetworkDescriptor }): void {
    if (this.output === "json") {
      const env = OutputEnvelope.error(ctx?.commandId ?? "", ctx?.net, err.toEnvelope(), this.#meta());
      this.streams.result(toJson(env));
    } else {
      this.streams.errorLine(`error [${err.code}]: ${err.message}`);
    }
  }
}

function renderText(command: string, net: NetworkDescriptor | undefined, data: unknown): string {
  const lines: string[] = [`✓ ${command}`];
  if (net) lines.push(`  network: ${net.aliases[0] ?? net.chainId} (${net.id})`);
  if (data && typeof data === "object" && !Array.isArray(data)) {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      lines.push(`  ${k}: ${stringifyValue(v)}`);
    }
  } else if (data !== undefined && data !== null && !(typeof data === "object")) {
    lines.push(`  ${String(data)}`);
  } else if (Array.isArray(data)) {
    for (const item of data) lines.push(`  - ${stringifyValue(item)}`);
  }
  return lines.join("\n");
}

function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
