/**
 * SecretResolver (L1) — single place that reads secrets, memoized per source (plan §7.13).
 * Handlers must never touch process.stdin directly. Secrets never enter logs/envelopes.
 */
import type { SecretKind, SecretResolver as ISecretResolver, StreamManager } from "../types/index.js";
import { ExecutionError } from "../errors/index.js";

export interface SecretFlags {
  passwordStdin?: boolean;
  privateKeyStdin?: boolean;
  mnemonicStdin?: boolean;
  txStdin?: boolean;
}

export class SecretResolver implements ISecretResolver {
  #stdin?: string;
  #password?: string;

  constructor(
    private readonly streams: StreamManager,
    private readonly flags: SecretFlags,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  /** stdin is a single shared source; at most one secret-bearing stdin flag per run. */
  #readStdin(): string {
    if (this.#stdin === undefined) {
      this.#stdin = this.streams.readStdinOnce().replace(/\r?\n$/, "");
    }
    return this.#stdin;
  }

  hasMasterPassword(): boolean {
    return this.#password !== undefined || !!this.flags.passwordStdin || !!this.env.MASTER_PASSWORD;
  }

  masterPassword(): string {
    if (this.#password !== undefined) return this.#password;
    if (this.flags.passwordStdin) {
      this.#password = this.#readStdin();
    } else if (this.env.MASTER_PASSWORD) {
      this.#password = this.env.MASTER_PASSWORD;
    } else {
      throw new ExecutionError(
        "auth_required",
        "master password required: set MASTER_PASSWORD or pass --password-stdin",
      );
    }
    return this.#password;
  }

  read(kind: SecretKind): string {
    switch (kind) {
      case "password":
        return this.masterPassword();
      case "privateKey":
        if (!this.flags.privateKeyStdin)
          throw new ExecutionError("secret_source_error", "expected --private-key-stdin");
        return this.#readStdin();
      case "mnemonic":
        if (!this.flags.mnemonicStdin)
          throw new ExecutionError("secret_source_error", "expected --mnemonic-stdin");
        return this.#readStdin();
      case "tx":
        if (!this.flags.txStdin)
          throw new ExecutionError("secret_source_error", "expected --tx-stdin");
        return this.#readStdin();
    }
  }
}
