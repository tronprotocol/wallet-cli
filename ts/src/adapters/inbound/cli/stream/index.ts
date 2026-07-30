/**
 * StreamManager — strict stdout/stderr discipline.
 *   result      → stdout, exactly once per execution
 *   diagnostic  → stderr, debug gated by verbose; warns are captured for meta.warnings
 *   readStdinOnce → consumes stdin once; a second read throws
 */
import { readFileSync } from "node:fs";
import type { OutputMode } from "../../../../domain/types/index.js";
import type {
  DiagnosticLevel,
  StreamManager as IStreamManager,
} from "../contracts/index.js";
import { ExecutionError } from "../../../../domain/errors/index.js";

export class StreamManager implements IStreamManager {
  #resultWritten = false;
  #stdinRead = false;
  #warnings: string[] = [];

  constructor(
    private readonly output: OutputMode,
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
      if (this.output === "text") this.err(`warning: ${msg}\n`);
      return;
    }
    if (level === "debug" && !this.verbose) return;
    this.err(`${msg}\n`);
  }

  errorLine(msg: string): void {
    this.err(msg.endsWith("\n") ? msg : msg + "\n");
  }

  /**
   * Intermediate progress frame (long flows: Ledger wait / signed / broadcasting).
   * Plain line to stderr — keeps stdout reserved for the single terminal frame.
   * Not a terminal frame: callable many times, device prompts must surface.
   */
  event(frame: string | null): void {
    if (frame === null) return;
    this.err(frame.endsWith("\n") ? frame : frame + "\n");
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
