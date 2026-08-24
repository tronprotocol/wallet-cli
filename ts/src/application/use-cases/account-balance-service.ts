import type { ChainFamily, NetworkDescriptor } from "../../domain/types/index.js";
import { FAMILIES } from "../../domain/family/index.js";
import type { AccountScope } from "../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../ports/chain/gateway-provider.js";

/**
 * Native balance, for any family.
 *
 * Family-neutral by construction: the balance comes through the gateway provider's neutral
 * `client()`, which every family's gateway satisfies, so this needs no per-family branch and no
 * per-family copy. One implementation also means the symbol rule below cannot drift between
 * chains — which is exactly how a wallet ends up naming the wrong currency.
 */
export class AccountBalanceService {
  constructor(private readonly gateways: ChainGatewayProvider) {}

  async balance(scope: AccountScope, network: NetworkDescriptor, family: ChainFamily) {
    const address = scope.resolveAddress(family);
    return {
      address,
      balance: await this.gateways.client(network).getNativeBalance(address),
      // Decimals are a FAMILY fact (sun→TRX is 6, wei→ether is 18) …
      decimals: FAMILIES[family].nativeDecimals,
      // … but the coin's name is a NETWORK fact. `evm:1` is ETH and `evm:56` is BNB, one family
      // with two coins, so a family-level symbol would be right for at most one of them.
      symbol: network.nativeSymbol,
    };
  }
}
