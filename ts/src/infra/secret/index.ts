/**
 * SecretResolver (L1) — the single place that reads secrets, memoized per source (plan §7.13.1).
 * Every secret kind binds to its own source `--<kind>-stdin`, which reads stdin (fd 0) — at most
 * one secret may use it per run. The `--<kind>-file`/`/dev/fd/N` multi-fd path was removed; commands
 * needing a 2nd secret (import-mnemonic/import-private-key/backup) go interactive (spec §6).
 * There is NO env source (no MASTER_PASSWORD): secrets never sit in env/process-table/history.
 * Handlers must never touch process.stdin directly. Secrets never enter logs/envelopes.
 */
import type { SecretKind, SecretResolver as ISecretResolver, StreamManager } from "../../core/types/index.js";
import { ExecutionError, UsageError } from "../../core/errors/index.js";

/** path per secret kind; the only source is `--<kind>-stdin`, so the value is always `-` (stdin). */
export type SecretPaths = Partial<Record<SecretKind, string>>;

/** the flag stem for a kind (e.g. privateKey → "private-key", so `--private-key-stdin`). */
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
      throw new ExecutionError("auth_required", "master password required: pass --password-stdin");
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
        throw new ExecutionError("auth_required", "master password required: pass --password-stdin");
      throw new ExecutionError("secret_source_error", `missing --${flagOf(kind)}-stdin`);
    }
    return this.#readPath(path, kind);
  }

  /**
   * Read a REQUIRED source. A missing source is a usage error (forgot a required flag →
   * missing_option, exit 2); secret_source_error is reserved for present-but-unreadable.
   */
  require(kind: SecretKind): string {
    if (!this.has(kind)) {
      throw new UsageError("missing_option", `--${flagOf(kind)}-stdin is required`);
    }
    return this.read(kind);
  }

  /**
   * Exactly-one selector for commands that accept an inline value OR a stdin source
   * (e.g. --transaction|--tx-stdin, --message|--message-stdin). Both → invalid_option;
   * neither → missing_option (both usage/exit 2).
   */
  pick(inline: string | undefined, kind: SecretKind, inlineFlag: string): string {
    const hasStdin = this.has(kind);
    if (inline !== undefined && hasStdin) {
      throw new UsageError("invalid_option", `--${inlineFlag} and --${flagOf(kind)}-stdin are mutually exclusive`);
    }
    if (inline !== undefined) return inline;
    if (hasStdin) return this.read(kind);
    throw new UsageError("missing_option", `--${inlineFlag} or --${flagOf(kind)}-stdin is required`);
  }

  /** The only source is stdin (fd 0), so `path` is always `-`; at most one secret may use it. */
  #readPath(_path: string, kind: SecretKind): string {
    if (this.#stdinUsedBy && this.#stdinUsedBy !== kind) {
      throw new ExecutionError(
        "secret_source_error",
        `stdin already consumed by --${flagOf(this.#stdinUsedBy)}-stdin; only one secret may use stdin per run`,
      );
    }
    this.#stdinUsedBy = kind;
    if (!this.#byPath.has("-")) {
      this.#byPath.set("-", this.streams.readStdinOnce().replace(/\r?\n$/, ""));
    }
    return this.#byPath.get("-")!;
  }
}
