import { join } from "node:path";
import { TOKENS_VERSION } from "../../../domain/migration/tokens-v2.js";
import type {
  AccountRef,
  EffectiveTokenEntry,
  TokenEntry,
  TokensFile,
} from "../../../domain/types/index.js";
import { AtomicFileStore } from "../persistence/fs/index.js";
import { parseTokensFile } from "../../../domain/token/index.js";
import { effectiveTokens, withoutUserToken, withUserToken } from "../../../domain/token/book.js";
import { OFFICIAL_TOKENS } from "./builtins.js";
import type { TokenRepository } from "../../../application/ports/token-repository.js";

const scopeKey = (networkId: string, ref: AccountRef): string => `${networkId}|${ref}`;

export class TokenBook implements TokenRepository {
  readonly tokensPath: string;
  constructor(
    private readonly root: string,
    private readonly store: AtomicFileStore,
  ) {
    this.tokensPath = join(root, "tokens.json");
  }

  official(networkId: string): TokenEntry[] {
    return OFFICIAL_TOKENS[networkId] ?? [];
  }

  user(networkId: string, ref: AccountRef): TokenEntry[] {
    const file = this.#read();
    return file.entries[scopeKey(networkId, ref)] ?? [];
  }

  effective(networkId: string, ref: AccountRef): EffectiveTokenEntry[] {
    return effectiveTokens(this.official(networkId), this.user(networkId, ref));
  }

  add(networkId: string, ref: AccountRef, input: TokenEntry): "added" | "refreshed" {
    return this.#update(networkId, ref, (user) => {
      const { tokens, action } = withUserToken(this.official(networkId), user, input, networkId);
      return { tokens, result: action };
    });
  }

  remove(networkId: string, ref: AccountRef, kind: TokenEntry["kind"], input: string): TokenEntry {
    return this.#update(networkId, ref, (user) => {
      const { tokens, removed } = withoutUserToken(this.official(networkId), user, kind, input);
      return { tokens, result: removed };
    });
  }

  // Applies one change to the account's book under the tokens.json lock; an empty book is removed.
  #update<T>(
    networkId: string,
    ref: AccountRef,
    change: (user: TokenEntry[]) => { tokens: TokenEntry[]; result: T },
  ): T {
    return this.store.withLock(this.tokensPath, () => {
      const file = this.#read();
      const key = scopeKey(networkId, ref);
      const { tokens, result } = change(file.entries[key] ?? []);
      if (tokens.length === 0) delete file.entries[key];
      else file.entries[key] = tokens;
      this.#write(file);
      return result;
    });
  }

  #read(): TokensFile {
    const raw = this.store.readJson<unknown>(this.tokensPath);
    return raw === null ? { version: TOKENS_VERSION, entries: {} } : parseTokensFile(raw);
  }
  #write(file: TokensFile): void {
    this.store.writeJson(this.tokensPath, file);
  }
}
