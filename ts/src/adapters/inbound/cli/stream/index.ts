// Reserve stdout for one result; diagnostics and progress use stderr.
import type { OutputMode } from "../../../../domain/types/index.js";
import type {
  DiagnosticLevel,
  StreamManager as IStreamManager,
  WarningItem,
} from "../contracts/index.js";
import { ExecutionError } from "../../../../domain/errors/index.js";

export class StreamManager implements IStreamManager {
  #resultWritten = false;
  #stdinRead = false;
  #warnings: WarningItem[] = [];

  constructor(
    private readonly output: OutputMode,
    private readonly verbose: boolean,
    private readonly out: (s: string) => void = (s) => process.stdout.write(s),
    private readonly err: (s: string) => void = (s) => process.stderr.write(s),
    private readonly stdin: () => NodeJS.ReadableStream = () => process.stdin,
  ) {}

  result(text: string): void {
    if (this.#resultWritten) {
      throw new ExecutionError("internal_error", "result emitted more than once");
    }
    this.#resultWritten = true;
    this.out(text.endsWith("\n") ? text : text + "\n");
  }

  diagnostic(level: DiagnosticLevel, msg: WarningItem): void {
    if (level === "warn") {
      this.#warnings.push(msg);
      if (this.output === "text")
        this.err(`warning: ${typeof msg === "string" ? msg : msg.message}\n`);
      return;
    }
    if (level === "debug" && !this.verbose) return;
    this.err(`${typeof msg === "string" ? msg : msg.message}\n`);
  }

  errorLine(msg: string): void {
    this.err(msg.endsWith("\n") ? msg : msg + "\n");
  }

  // Progress must reach stderr even when verbose output is disabled.
  event(frame: string | null): void {
    if (frame === null) return;
    this.err(frame.endsWith("\n") ? frame : frame + "\n");
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
