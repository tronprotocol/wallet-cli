/**
 * SecretResolver — the single place that reads secrets, memoized per source.
 * Every secret kind binds to its own source `--<kind>-stdin`, which reads stdin (fd 0) — at most
 * one secret may use it per run. The `--<kind>-file`/`/dev/fd/N` multi-fd path was removed; commands
 * needing a 2nd secret (import-mnemonic/import-private-key/backup) go interactive.
 * There is NO env source (no MASTER_PASSWORD): secrets never sit in env/process-table/history.
 * Handlers must never touch process.stdin directly. Secrets never enter logs/envelopes.
 */
import type { SecretKind, SecretResolver as ISecretResolver, StreamManager } from "../../contracts/index.js";
import { ExecutionError, UsageError } from "../../../../../domain/errors/index.js";
import type { Prompter } from "../prompt/index.js";
import { passwordPolicyErrors, isValidMnemonic, isValidPrivateKeyHex } from "../prompt/validators.js";

/** path per secret kind; the only source is `--<kind>-stdin`, so the value is always `-` (stdin). */
export type SecretPaths = Partial<Record<SecretKind, string>>;

/** the flag stem for a kind (e.g. privateKey → "private-key", so `--private-key-stdin`). */
function flagOf(kind: SecretKind): string {
  return kind.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

export class SecretResolver implements ISecretResolver {
  #byPath = new Map<string, string>();
  #stdinUsedBy?: SecretKind;
  #primed = new Map<SecretKind, string>();

  constructor(
    private readonly streams: StreamManager,
    private readonly paths: SecretPaths = {},
    private readonly prompter?: Prompter,
  ) {}

  /** whether a master-password source is configured, WITHOUT consuming it. */
  hasMasterPassword(): boolean {
    return this.paths.password !== undefined || this.#primed.has("password");
  }

  masterPassword(): string {
    const primed = this.#primed.get("password");
    if (primed !== undefined) return primed;
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
    const primed = this.#primed.get(kind);
    if (primed !== undefined) return primed;
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

  /** Wallet secrets (mnemonic / private key) are TTY-only: a hidden interactive prompt, or fail.
   *  There is no `--*-stdin` source for them — importing an existing secret is a human moment. */
  async resolveSecret(kind: "mnemonic" | "privateKey"): Promise<string> {
    const validate = kind === "mnemonic" ? isValidMnemonic : isValidPrivateKeyHex;
    if (this.prompter?.isTTY()) {
      const label = kind === "mnemonic"
        ? "Paste recovery phrase (hidden)"
        : "Paste private key (hidden)";
      const v = await this.prompter.hidden({
        label,
        validate: (s) => (validate(s.trim()) ? null : `invalid ${kind}`),
      });
      const trimmed = v.trim();
      this.#primed.set(kind, trimmed);
      return trimmed;
    }
    throw new UsageError("tty_required", `${kind} entry is interactive; run in a terminal`);
  }

  async primePassword(plan: { mode: "set" | "verify"; verify?: (pw: string) => boolean }): Promise<void> {
    if (this.has("password")) {
      const pw = this.read("password");
      if (plan.mode === "set") {
        const errs = passwordPolicyErrors(pw);
        if (errs.length) throw new UsageError("weak_password", `password too weak: ${errs.join("; ")}`);
      }
      if (plan.mode === "verify" && plan.verify && !plan.verify(pw)) {
        throw new ExecutionError("auth_failed", "incorrect master password");
      }
      this.#primed.set("password", pw);
      this.streams.diagnostic("info", "password ✓ via pipe");
      return;
    }
    if (this.prompter?.isTTY()) {
      let pw: string;
      if (plan.mode === "set") {
        pw = await this.prompter.hidden({
          label: "Set master password (hidden)",
          confirmLabel: "Confirm master password",
          confirm: true,
          validate: (s) => { const e = passwordPolicyErrors(s); return e.length ? e.join("; ") : null; },
        });
      } else {
        pw = "";
        for (let attempt = 0; attempt < 3; attempt++) {
          pw = await this.prompter.hidden({ label: "Master password (hidden)" });
          if (plan.verify?.(pw)) { this.#primed.set("password", pw); return; }
          this.streams.diagnostic("warn", "incorrect master password");
        }
        throw new ExecutionError("auth_failed", "incorrect master password");
      }
      this.#primed.set("password", pw);
      return;
    }
    throw new ExecutionError("auth_required", "master password required: pass --password-stdin");
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
