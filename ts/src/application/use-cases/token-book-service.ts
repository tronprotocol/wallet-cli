import type { NetworkDescriptor } from "../../domain/types/index.js";
import type { AccountScope } from "../contracts/execution-scope.js";
import type { TokenRepository } from "../ports/token-repository.js";

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
