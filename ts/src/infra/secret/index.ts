/**
 * SecretResolver (L1) — the single place that reads secrets, memoized per source (plan §7.13.1).
 * Every secret kind binds to its own source `--<kind>-file <path>` where `path` is:
 *   `-`         → stdin (fd 0; at most one secret may use it per run)
 *   a file path → read once
 *   /dev/fd/N   → anonymous pipe from shell process substitution `<(...)`
 * There is NO env source (no MASTER_PASSWORD): secrets never sit in env/process-table/history.
 * Handlers must never touch process.stdin directly. Secrets never enter logs/envelopes.
 */
import { readFileSync } from "node:fs";
import type { SecretKind, SecretResolver as ISecretResolver, StreamManager } from "../../core/types/index.js";
import { ExecutionError, UsageError } from "../../core/errors/index.js";

/** path per secret kind; `-` means stdin, anything else is a filesystem path (incl. /dev/fd/N). */
export type SecretPaths = Partial<Record<SecretKind, string>>;

/** the flag stem for a kind (e.g. privateKey → "private-key", so `--private-key-file`). */
function flagOf(kind: SecretKind): string {
  return kind.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

export class SecretResolver implements ISecretResolver {
  #byPath = new Map<string, string>();
  #stdinUsedBy?: SecretKind;

  constructor(
    private readonly streams: StreamManager,
    private readonly paths: SecretPaths = {},
  ) {}

  /** whether a master-password source is configured, WITHOUT consuming it. */
  hasMasterPassword(): boolean {
    return this.paths.password !== undefined;
  }

  masterPassword(): string {
    if (this.paths.password === undefined) {
      throw new ExecutionError("auth_required", "master password required: pass --password-file <path> (or --password-stdin)");
    }
    return this.read("password");
  }

  /** whether a source for `kind` is configured, WITHOUT consuming it. */
  has(kind: SecretKind): boolean {
    return this.paths[kind] !== undefined;
  }

  read(kind: SecretKind): string {
    const path = this.paths[kind];
    if (path === undefined) {
      if (kind === "password")
        throw new ExecutionError("auth_required", "master password required: pass --password-file <path> (or --password-stdin)");
      throw new ExecutionError("secret_source_error", `missing --${kind}-file (or --${kind}-stdin)`);
    }
    return this.#readPath(path, kind);
  }

  /**
   * Read a REQUIRED source. A missing source is a usage error (forgot a required flag →
   * missing_option, exit 2); secret_source_error is reserved for present-but-unreadable.
   */
  require(kind: SecretKind): string {
    if (!this.has(kind)) {
      throw new UsageError("missing_option", `--${flagOf(kind)}-file (or --${flagOf(kind)}-stdin) is required`);
    }
    return this.read(kind);
  }

  /**
   * Exactly-one selector for commands that accept an inline value OR a file source
   * (e.g. --transaction|--tx-file, --message|--message-file). Both → invalid_option;
   * neither → missing_option (both usage/exit 2).
   */
  pick(inline: string | undefined, kind: SecretKind, inlineFlag: string): string {
    const hasFile = this.has(kind);
    if (inline !== undefined && hasFile) {
      throw new UsageError("invalid_option", `--${inlineFlag} and --${flagOf(kind)}-file are mutually exclusive`);
    }
    if (inline !== undefined) return inline;
    if (hasFile) return this.read(kind);
    throw new UsageError("missing_option", `--${inlineFlag} or --${flagOf(kind)}-file is required`);
  }

  #readPath(path: string, kind: SecretKind): string {
    if (path === "-") {
      if (this.#stdinUsedBy && this.#stdinUsedBy !== kind) {
        throw new ExecutionError(
          "secret_source_error",
          `stdin already consumed by --${this.#stdinUsedBy}-stdin; the second secret must use a file or /dev/fd/N`,
        );
      }
      this.#stdinUsedBy = kind;
      if (!this.#byPath.has("-")) {
        this.#byPath.set("-", this.streams.readStdinOnce().replace(/\r?\n$/, ""));
      }
      return this.#byPath.get("-")!;
    }
    if (!this.#byPath.has(path)) {
      let raw: string;
      try {
        raw = readFileSync(path, "utf8");
      } catch {
        throw new ExecutionError("secret_source_error", `cannot read --${kind}-file: ${path}`);
      }
      this.#byPath.set(path, raw.replace(/\r?\n$/, ""));
    }
    return this.#byPath.get(path)!;
  }
}
