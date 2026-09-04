import type { NetworkDescriptor } from "../../domain/types/index.js";
import type { AccountScope } from "../contracts/execution-scope.js";
import type { TokenRepository } from "../ports/token-repository.js";

/**
 * Address-book reads that touch no chain.
 *
 * Listing merges the official and user layers for one (network, account) pair — the same
 * operation on every family, so it lives once and both families bind to it. Anything that has to
 * ask the chain (balance, metadata, adding an entry) belongs to a family's own token service.
 */
export class TokenBookService {
  constructor(private readonly tokens: TokenRepository) {}

  list(scope: AccountScope, network: NetworkDescriptor) {
    return {
      network: network.id,
      account: scope.activeAccount,
      tokens: this.tokens.effective(network.id, scope.activeAccount),
    };
  }
}
