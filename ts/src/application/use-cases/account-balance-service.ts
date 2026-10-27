import type { ChainFamily, NetworkDescriptor } from "../../domain/types/index.js";
import { FAMILIES } from "../../domain/family/index.js";
import type { AccountScope } from "../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../ports/chain/gateway-provider.js";

export class AccountBalanceService {
  constructor(private readonly gateways: ChainGatewayProvider) {}

  async balance(scope: AccountScope, network: NetworkDescriptor, family: ChainFamily) {
    const address = scope.resolveAddress(family);
    return {
      address,
      balance: await this.gateways.client(network).getNativeBalance(address),
      decimals: FAMILIES[family].nativeDecimals,
      // Networks in one family can use different native currencies (ETH, BNB).
      symbol: network.nativeSymbol,
    };
  }
}
