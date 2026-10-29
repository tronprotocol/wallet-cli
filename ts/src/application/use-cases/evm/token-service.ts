import type { NetworkDescriptor, TokenEntry } from "../../../domain/types/index.js";
import { ExecutionError } from "../../../domain/errors/index.js";
import { canonicalTokenId } from "../../../domain/token/index.js";
import type { AccountScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TokenRepository } from "../../ports/token-repository.js";

export interface Erc20Selector {
  contract: string;
}

export class EvmTokenService {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly tokens: TokenRepository,
  ) {}

  async balance(scope: AccountScope, network: NetworkDescriptor, input: Erc20Selector) {
    const address = scope.resolveAddress("evm");
    const gateway = this.gateways.get(network, "evm");
    const [balance, meta] = await Promise.all([
      gateway.getErc20Balance(input.contract, address),
      // Metadata failures must not hide a readable balance.
      gateway.getErc20Metadata(input.contract).catch(() => ({})),
    ]);
    return { address, token: input.contract, balance, ...meta };
  }

  async info(network: NetworkDescriptor, input: Erc20Selector) {
    const meta = await this.gateways.get(network, "evm").getErc20Metadata(input.contract);
    if (meta.symbol === undefined && meta.decimals === undefined && meta.name === undefined) {
      throw new ExecutionError(
        "token_metadata_unavailable",
        `${input.contract} did not answer symbol, decimals or name — it may not be a token contract`,
      );
    }
    return { contract: input.contract, ...meta };
  }

  // Stored decimals scale future transfers; never substitute a guess.
  async add(scope: AccountScope, network: NetworkDescriptor, input: Erc20Selector) {
    const meta = await this.gateways.get(network, "evm").getErc20Metadata(input.contract);
    if (meta.decimals === undefined || meta.symbol === undefined || meta.symbol === "") {
      throw new ExecutionError(
        "token_metadata_unavailable",
        `could not read symbol/decimals for ${input.contract}`,
      );
    }
    const token: TokenEntry = {
      kind: "erc20",
      id: canonicalTokenId("erc20", input.contract),
      symbol: meta.symbol,
      decimals: meta.decimals,
      ...(meta.name === undefined ? {} : { name: meta.name }),
    };
    return {
      network: network.id,
      account: scope.activeAccount,
      action: this.tokens.add(network.id, scope.activeAccount, token),
      token,
    };
  }

  async remove(scope: AccountScope, network: NetworkDescriptor, input: Erc20Selector) {
    return {
      network: network.id,
      account: scope.activeAccount,
      removed: this.tokens.remove(network.id, scope.activeAccount, "erc20", input.contract),
    };
  }
}
