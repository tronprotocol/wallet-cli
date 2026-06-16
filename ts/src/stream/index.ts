/**
 * StreamManager (L0, side-effecting) — strict stdout/stderr discipline (plan §7.13).
 *   result()      → stdout, exactly once per execution
 *   diagnostic()  → stderr, gated by quiet/verbose; warns are captured for meta.warnings
 *   readStdinOnce → consumes stdin once; a second read throws
 */
import { readFileSync } from "node:fs";
import type { DiagnosticLevel, OutputMode, StreamManager as IStreamManager } from "../types/index.js";
import { ExecutionError } from "../errors/index.js";

export class StreamManager implements IStreamManager {
  #resultWritten = false;
  #stdinRead = false;
  #warnings: string[] = [];

  constructor(
    private readonly output: OutputMode,
    private readonly quiet: boolean,
    private readonly verbose: boolean,
    private readonly out: (s: string) => void = (s) => process.stdout.write(s),
    private readonly err: (s: string) => void = (s) => process.stderr.write(s),
  ) {}

  result(text: string): void {
    if (this.#resultWritten) {
      throw new ExecutionError("internal_error", "result emitted more than once");
    }
    this.#resultWritten = true;
    this.out(text.endsWith("\n") ? text : text + "\n");
  }

  diagnostic(level: DiagnosticLevel, msg: string): void {
    if (level === "warn") {
      this.#warnings.push(msg);
      if (this.output === "text" && !this.quiet) this.err(`warning: ${msg}\n`);
      return;
    }
    if (this.quiet) return;
    if (level === "debug" && !this.verbose) return;
    this.err(`${msg}\n`);
  }

  errorLine(msg: string): void {
    this.err(msg.endsWith("\n") ? msg : msg + "\n");
  }

  warnings(): string[] {
    return this.#warnings;
  }

  readStdinOnce(): string {
    if (this.#stdinRead) {
      throw new ExecutionError("secret_source_error", "stdin already consumed");
    }
    this.#stdinRead = true;
    try {
      return readFileSync(0, "utf8");
    } catch {
      throw new ExecutionError("secret_source_error", "no data available on stdin");
    }
  }
}
