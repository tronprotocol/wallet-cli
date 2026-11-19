import type { JsonValue } from "../../domain/types/index.js";

// A detached copy of this CLI: stdin and stdout are ignored, stderr goes to `stderr`, and an IPC channel is
// open to the parent.
export interface DetachedCliStart {
  // The CLI arguments, without the runtime or the entry script.
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
  // An open file descriptor.
  readonly stderr: number;
}

// The operations a parent uses on the started copy.
export interface DetachedCli {
  readonly pid?: number;
  readonly connected: boolean;
  on(event: "message", listener: (message: JsonValue) => void): void;
  once(event: "error" | "exit", listener: () => void): void;
  off(event: "message", listener: (message: JsonValue) => void): void;
  off(event: "error" | "exit", listener: () => void): void;
  disconnect(): void;
  unref(): void;
  kill(signal: "SIGTERM"): void;
}

export interface CliLauncher {
  startDetached(start: DetachedCliStart): DetachedCli;
}
