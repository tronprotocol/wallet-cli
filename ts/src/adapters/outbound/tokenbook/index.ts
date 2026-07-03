/**
 * TokenBook — the token address-book: official builtin layer (per network) +
 * user layer (`tokens.json`, per network+account). `effective` is the union both `token list`
 * and portfolio walk. Atomic writes under lock (same store as wallets.json). No secrets.
 */
import { join } from "node:path";
import type {
  AccountRef, EffectiveTokenEntry, TokenEntry, TokensFile } from "../../../domain/types/index.js";
import { AtomicFileStore } from "../persistence/fs/index.js";
import { UsageError } from "../../../domain/errors/index.js";
import { OFFICIAL_TOKENS } from "./builtins.js";
import type { TokenRepository } from "../../../application/ports/token-repository.js";

/** scope key for the user layer — a token list is owned by one (network, account) pair. */
const scopeKey = (networkId: string, ref: AccountRef): string => `${networkId}|${ref}`;
const sameToken = (a: { kind: string; id: string }, b: { kind: string; id: string }): boolean =>
  a.kind === b.kind && a.id === b.id;

export class TokenBook implements TokenRepository {
  readonly tokensPath: string;
  constructor(
    private readonly root: string,
    private readonly store: AtomicFileStore,
  ) {
    this.tokensPath = join(root, "tokens.json");
  }

  // ── reads ──────────────────────────────────────────────────────────────────
  official(networkId: string): TokenEntry[] {
    return OFFICIAL_TOKENS[networkId] ?? [];
  }

  user(networkId: string, ref: AccountRef): TokenEntry[] {
    const file = this.#read();
    return file.entries[scopeKey(networkId, ref)] ?? [];
  }

  /** official first, then user-only; deduped by kind+id; each row tagged with its source. */
  effective(networkId: string, ref: AccountRef): EffectiveTokenEntry[] {
    const official = this.official(networkId).map((t) => ({ ...t, source: "official" as const }));
    const userOnly = this.user(networkId, ref)
      .filter((u) => !official.some((o) => sameToken(o, u)))
      .map((t) => ({ ...t, source: "user" as const }));
    return [...official, ...userOnly];
  }

  // ── writes ─────────────────────────────────────────────────────────────────
  /** add to the user layer. official dup → token_already_listed; user dup → idempotent refresh. */
  add(networkId: string, ref: AccountRef, entry: TokenEntry): "added" | "refreshed" {
    if (this.official(networkId).some((o) => sameToken(o, entry))) {
      throw new UsageError(
        "token_already_listed",
        `${entry.id} is already an official token on ${networkId}`,
      );
    }
    return this.store.withLock(this.tokensPath, () => {
      const file = this.#read();
      const key = scopeKey(networkId, ref);
      const list = file.entries[key] ?? [];
      const at = list.findIndex((t) => sameToken(t, entry));
      const action = at >= 0 ? "refreshed" : "added";
      if (at >= 0) list[at] = entry;
      else list.push(entry);
      file.entries[key] = list;
      this.#write(file);
      return action;
    });
  }

  /** remove from the user layer only. official → token_is_official; absent → token_not_in_book. */
  remove(networkId: string, ref: AccountRef, kind: TokenEntry["kind"], id: string): TokenEntry {
    if (this.official(networkId).some((o) => sameToken(o, { kind, id }))) {
      throw new UsageError("token_is_official", `cannot remove an official token: ${id}`);
    }
    return this.store.withLock(this.tokensPath, () => {
      const file = this.#read();
      const key = scopeKey(networkId, ref);
      const list = file.entries[key] ?? [];
      const at = list.findIndex((t) => sameToken(t, { kind, id }));
      if (at < 0) {
        throw new UsageError("token_not_in_book", `token not in this account's book: ${id}`);
      }
      const [removed] = list.splice(at, 1);
      if (list.length === 0) delete file.entries[key];
      else file.entries[key] = list;
      this.#write(file);
      return removed!;
    });
  }

  // ── internals ──────────────────────────────────────────────────────────────
  #read(): TokensFile {
    return this.store.readJson<TokensFile>(this.tokensPath) ?? { version: 1, entries: {} };
  }
  #write(file: TokensFile): void {
    this.store.writeJson(this.tokensPath, file);
  }
}
