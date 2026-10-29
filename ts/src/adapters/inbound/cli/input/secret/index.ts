// Memoize secrets per command; keep them out of logs and envelopes.
import { isatty } from "node:tty";
import type {
  SecretKind,
  SecretResolver as ISecretResolver,
  StreamManager,
} from "../../contracts/index.js";
import { ExecutionError, UsageError } from "../../../../../domain/errors/index.js";
import type { Prompter } from "../prompt/index.js";
import { isValidMnemonic, isValidPrivateKeyHex } from "../prompt/validators.js";
import {
  assertPasswordPolicy,
  passwordPolicyErrors,
} from "../../../../../domain/wallet/password-policy.js";

// Configured stdin sources use "-" (fd 0).
export type SecretPaths = Partial<Record<SecretKind, string>>;

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

  // Releases references; immutable JavaScript strings cannot be securely wiped.
  clearPrimed(): void {
    this.#primed.clear();
    this.#byPath.clear();
    this.#stdinUsedBy = undefined;
  }

  // Checks availability without consuming the source.
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

  // Checks availability without consuming the source.
  has(kind: SecretKind): boolean {
    return this.paths[kind] !== undefined;
  }

  read(kind: SecretKind): string {
    const primed = this.#primed.get(kind);
    if (primed !== undefined) return primed;
    const path = this.paths[kind];
    if (path === undefined) {
      if (kind === "password")
        throw new ExecutionError(
          "auth_required",
          "master password required: pass --password-stdin",
        );
      throw new ExecutionError("secret_source_error", `missing --${flagOf(kind)}-stdin`);
    }
    return this.#readPath(path, kind);
  }

  // Missing input is a usage error; unreadable input is an execution error.
  require(kind: SecretKind): string {
    if (!this.has(kind)) {
      throw new UsageError("missing_option", `--${flagOf(kind)}-stdin is required`);
    }
    return this.read(kind);
  }

  // Require exactly one of the inline value or stdin source.
  pick(inline: string | undefined, kind: SecretKind, inlineFlag: string): string {
    const hasStdin = this.has(kind);
    if (inline !== undefined && hasStdin) {
      throw new UsageError(
        "invalid_option",
        `--${inlineFlag} and --${flagOf(kind)}-stdin are mutually exclusive`,
      );
    }
    if (inline !== undefined) return inline;
    if (hasStdin) return this.read(kind);
    throw new UsageError(
      "missing_option",
      `--${inlineFlag} or --${flagOf(kind)}-stdin is required`,
    );
  }

  // Wallet secrets require a hidden TTY prompt.
  async resolveSecret(kind: "mnemonic" | "privateKey"): Promise<string> {
    const validate = kind === "mnemonic" ? isValidMnemonic : isValidPrivateKeyHex;
    if (this.prompter?.isTTY()) {
      const label =
        kind === "mnemonic" ? "Paste recovery phrase (hidden)" : "Paste private key (hidden)";
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

  async primePassword(plan: {
    mode: "set" | "verify";
    verify?: (pw: string) => boolean;
  }): Promise<void> {
    // Reuse verified passwords; set mode must obtain a new password.
    const primed = this.#primed.get("password");
    if (plan.mode === "verify" && primed !== undefined && (plan.verify?.(primed) ?? true)) {
      return;
    }
    if (this.has("password")) {
      const pw = this.read("password");
      if (plan.mode === "set") assertPasswordPolicy(pw);
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
          validate: (s) => {
            const e = passwordPolicyErrors(s);
            return e.length ? e.join("; ") : null;
          },
        });
      } else {
        for (let attempt = 0; attempt < 3; attempt++) {
          pw = await this.prompter.hidden({ label: "Master password (hidden)" });
          if (plan.verify?.(pw)) {
            this.#primed.set("password", pw);
            return;
          }
          this.streams.diagnostic("warn", "incorrect master password");
        }
        throw new ExecutionError("auth_failed", "incorrect master password");
      }
      this.#primed.set("password", pw);
      return;
    }
    throw new ExecutionError("auth_required", "master password required: pass --password-stdin");
  }

  // Only one secret kind may consume stdin per run.
  #readPath(_path: string, kind: SecretKind): string {
    if (this.#stdinUsedBy && this.#stdinUsedBy !== kind) {
      throw new ExecutionError(
        "secret_source_error",
        `stdin already consumed by --${flagOf(this.#stdinUsedBy)}-stdin; only one secret may use stdin per run`,
      );
    }
    this.#stdinUsedBy = kind;
    if (!this.#byPath.has("-")) {
      if (kind === "apiKey" && isatty(0))
        this.streams.diagnostic(
          "info",
          "Reading API key from stdin; finish input with Ctrl-D. Use a pipe for non-interactive input.",
        );
      this.#byPath.set("-", this.streams.readStdinOnce().replace(/\r?\n$/, ""));
    }
    return this.#byPath.get("-")!;
  }
}
