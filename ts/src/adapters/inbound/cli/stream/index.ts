// Reserve stdout for one result; diagnostics and progress use stderr. Every write masks the
// configured credentials, so no output path can print one.
import type { OutputMode } from "../../../../domain/types/index.js";
import type {
  DiagnosticLevel,
  FrameFormat,
  StreamManager as IStreamManager,
  WarningItem,
} from "../contracts/index.js";
import { ExecutionError } from "../../../../domain/errors/index.js";
import { escapeControls } from "../render/scalars.js";
import { CredentialMask } from "../output/mask.js";

export class StreamManager implements IStreamManager {
  #resultWritten = false;
  #stdinRead = false;
  #warnings: WarningItem[] = [];
  readonly #out: (s: string, format?: FrameFormat) => void;
  readonly #err: (s: string, format?: FrameFormat) => void;

  constructor(
    private readonly output: OutputMode,
    private readonly verbose: boolean,
    out: (s: string) => void = (s) => process.stdout.write(s),
    err: (s: string) => void = (s) => process.stderr.write(s),
    private readonly stdin: () => NodeJS.ReadableStream = () => process.stdin,
    credentials: readonly string[] = [],
  ) {
    const mask = new CredentialMask(credentials);
    this.#out = (s, format = "text") => out(format === "json" ? mask.json(s) : mask.text(s));
    this.#err = (s, format = "text") => err(format === "json" ? mask.json(s) : mask.text(s));
  }

  result(text: string, format: FrameFormat = "text"): void {
    if (this.#resultWritten) {
      throw new ExecutionError("internal_error", "result emitted more than once");
    }
    this.#resultWritten = true;
    this.#out(text.endsWith("\n") ? text : text + "\n", format);
  }

  diagnostic(level: DiagnosticLevel, msg: WarningItem): void {
    if (level === "warn") {
      this.#warnings.push(msg);
      if (this.output === "text")
        this.#err(`warning: ${escapeControls(typeof msg === "string" ? msg : msg.message)}\n`);
      return;
    }
    if (level === "debug" && !this.verbose) return;
    this.#err(`${escapeControls(typeof msg === "string" ? msg : msg.message)}\n`);
  }

  errorLine(msg: string): void {
    const line = escapeControls(msg);
    this.#err(line.endsWith("\n") ? line : line + "\n");
  }

  // Progress must reach stderr even when verbose output is disabled.
  event(frame: string | null, format: FrameFormat = "text"): void {
    if (frame === null) return;
    this.#err(frame.endsWith("\n") ? frame : frame + "\n", format);
  }

  warnings(): WarningItem[] {
    return this.#warnings;
  }

  async readStdinOnce(signal: AbortSignal): Promise<string> {
    return (await this.readStdinBytesOnce(signal)).toString("utf8");
  }

  // Asynchronous so that the command deadline's timer keeps running while stdin is open.
  readStdinBytesOnce(signal: AbortSignal): Promise<Buffer> {
    if (this.#stdinRead) {
      return Promise.reject(new ExecutionError("secret_source_error", "stdin already consumed"));
    }
    this.#stdinRead = true;
    if (signal.aborted) return Promise.reject(signal.reason);
    const input = this.stdin();
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const onData = (chunk: Buffer | string) =>
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      const onEnd = () => {
        cleanup();
        resolve(Buffer.concat(chunks));
      };
      const onError = () => {
        cleanup();
        reject(new ExecutionError("secret_source_error", "no data available on stdin"));
      };
      const onAbort = () => {
        cleanup();
        input.pause();
        reject(signal.reason);
      };
      const cleanup = () => {
        input.off("data", onData);
        input.off("end", onEnd);
        input.off("error", onError);
        signal.removeEventListener("abort", onAbort);
      };
      input.on("data", onData);
      input.once("end", onEnd);
      input.once("error", onError);
      signal.addEventListener("abort", onAbort, { once: true });
      input.resume();
    });
  }
}
