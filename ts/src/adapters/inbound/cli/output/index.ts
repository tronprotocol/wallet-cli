/**
 * OutputFormatter — turn outcomes into result/event frame strings without changing
 * behavior. Instead of one class branching on `if (output === "json")`, this is an interface
 * with two implementations chosen by createOutputFormatter (borrowed from ledger wallet-cli
 * output.ts). The formatter only computes strings; StreamManager owns writing & stream choice.
 *   - success → single terminal frame (caller hands to streams.result)
 *   - error   → terminal error (json envelope to stdout, or short stderr line)
 *   - event   → intermediate progress frame (caller hands to streams.event); null = not shown
 * JSON mode emits exactly one terminal envelope; empty data is {}; big numbers stay strings.
 * Neutral commands omit `chain`.
 */
import type { NetworkDescriptor, OutputMode } from "../../../../domain/types/index.js";
import type { ProgressEvent } from "../../../../application/contracts/index.js";
import type { CommandDefinition, StreamManager } from "../contracts/index.js";
import type { CliError } from "../../../../domain/errors/index.js";
import { OutputEnvelope, toJson } from "./envelope.js";
import { renderGenericText } from "../render/index.js";
import { sanitizeText } from "../render/scalars.js";

export interface OutputFormatter {
  /** the single result frame for the caller to hand to streams.result. */
  success(cmd: CommandDefinition, net: NetworkDescriptor | undefined, data: unknown, accountLabel?: string): string;
  /** terminal error output (JSON envelope to stdout, or short line to stderr). */
  error(err: CliError, ctx?: { commandId?: string; net?: NetworkDescriptor }): void;
  /** intermediate progress frame for streams.event; null = this mode does not show it. */
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
    // JSON mode always uses the envelope; the account label is a text-mode display nicety.
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
  // Text mode: strip terminal control bytes from every frame so a hostile wallet label or remote
  // token/RPC metadata value cannot inject ANSI/OSC sequences (CLI-OUT-001). JSON mode stays raw.
  success(cmd: CommandDefinition, net: NetworkDescriptor | undefined, data: unknown, accountLabel?: string): string {
    const env = OutputEnvelope.success(cmd, net, data, this.meta());
    const custom = cmd.formatText?.(env.data, { command: env.command, net, accountLabel });
    return sanitizeText(custom ?? renderGenericText(env.command, net, env.data));
  }

  error(err: CliError): void {
    this.streams.errorLine(sanitizeText(`error [${err.code}]: ${err.message}`));
  }

  event(e: ProgressEvent): string {
    return sanitizeText(renderEvent(e));
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

// plain human progress line (no spinner / no TTY detection — Standard CLI / agent-first).
function renderEvent(e: ProgressEvent): string {
  switch (e.type) {
    case "awaiting_device":
      switch (e.reason) {
        case "sign": return "⧖ review and approve the transaction on your device";
        case "open_app": return "⧖ confirm on your device to open the app";
        case "unlock": return "⧖ unlock your device with your PIN";
      }
    // eslint-disable-next-line no-fallthrough
    case "deriving-address": return "deriving address from your device…";
    case "pre-verify-address": return `compare with your device: ${e.address}`;
    case "signed": return "✓ signed; broadcasting…";
    case "broadcasting": return "broadcasting…";
    case "dry-run": return "dry run (transaction not broadcast)";
  }
}
