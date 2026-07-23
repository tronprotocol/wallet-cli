/** CLI runtime seams implemented by stream and secret input adapters. */
import type { NetworkDescriptor } from "../../../../domain/types/network.js";
import type { WarningItem } from "./envelope.js";

export type DiagnosticLevel = "info" | "debug" | "warn";

export interface StreamManager {
  result(text: string): void;
  diagnostic(level: DiagnosticLevel, msg: WarningItem): void;
  /** always-on stderr line. */
  errorLine(msg: string): void;
  /** intermediate progress frame → stderr plain line; null is skipped (StreamManager). */
  event(frame: string | null): void;
  readStdinOnce(): string;
  /** warnings accumulated for the JSON envelope's meta.warnings. */
  warnings(): WarningItem[];
}

export type SecretKind = "password" | "privateKey" | "mnemonic" | "tx" | "message";
export interface SecretResolver {
  masterPassword(): string;
  /** whether a master-password source exists, WITHOUT consuming stdin. */
  hasMasterPassword(): boolean;
  /** whether a source for `kind` is configured, WITHOUT consuming it. */
  has(kind: SecretKind): boolean;
  read(kind: SecretKind): string;
  /** read a required source; missing → missing_option (usage), not secret_source_error. */
  require(kind: SecretKind): string;
  /** exactly-one selector: inline value XOR the file/stdin source for `kind`. */
  pick(inline: string | undefined, kind: SecretKind, inlineFlag: string): string;
  /** resolve a non-password secret: stdin source → hidden prompt → missing_option. */
  resolveSecret(kind: "mnemonic" | "privateKey"): Promise<string>;
  /** establish/verify the master password before synchronous keystore use. */
  primePassword(plan: { mode: "set" | "verify"; verify?: (pw: string) => boolean }): Promise<void>;
}

/** Mutable dispatch contract: CliShell records the in-flight command (+ resolved network) here so the
 *  runner's single terminal catch can attach commandId/net to the error envelope across yargs. */
export interface SessionRef {
  current?: { commandId: string; net?: NetworkDescriptor };
}
