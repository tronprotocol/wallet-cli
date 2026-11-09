import type { NetworkDescriptor } from "../../../../domain/types/network.js";
import type { WarningItem } from "./envelope.js";

export type DiagnosticLevel = "info" | "debug" | "warn";

export interface StreamManager {
  result(text: string): void;
  diagnostic(level: DiagnosticLevel, msg: WarningItem): void;
  // Always writes to stderr.
  errorLine(msg: string): void;
  // Progress on stderr; null is skipped.
  event(frame: string | null): void;
  // Reads stdin to its end; the signal stops the read and rejects with its reason.
  readStdinOnce(signal: AbortSignal): Promise<string>;
  // Shares the single-consumption guard with readStdinOnce.
  readStdinBytesOnce(signal: AbortSignal): Promise<Uint8Array>;
  // Accumulated for meta.warnings in JSON output.
  warnings(): WarningItem[];
}

export const SECRET_KINDS = [
  "password",
  "privateKey",
  "mnemonic",
  "tx",
  "message",
  "apiKey",
] as const;
export type SecretKind = (typeof SECRET_KINDS)[number];
export interface SecretResolver {
  // Reads a stdin secret before synchronous reads need it.
  loadStdin(signal: AbortSignal): Promise<void>;
  masterPassword(): string;
  // Checks availability without consuming stdin.
  hasMasterPassword(): boolean;
  // Checks availability without consuming the source.
  has(kind: SecretKind): boolean;
  read(kind: SecretKind): string;
  // Missing input raises missing_option, not secret_source_error.
  require(kind: SecretKind): string;
  // Exactly one of the inline value or stdin source is required.
  pick(inline: string | undefined, kind: SecretKind, inlineFlag: string): string;
  // Hidden TTY prompt only; otherwise raise tty_required.
  resolveSecret(kind: "mnemonic" | "privateKey"): Promise<string>;
  // Establish or verify the password before synchronous keystore calls.
  primePassword(plan: { mode: "set" | "verify"; verify?: (pw: string) => boolean }): Promise<void>;
}

// Carries the active command and network to the runner's terminal error handler.
export interface SessionRef {
  current?: { commandId: string; net?: NetworkDescriptor };
}
