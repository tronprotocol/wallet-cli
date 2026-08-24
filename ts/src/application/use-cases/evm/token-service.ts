import type { NetworkDescriptor, TokenEntry } from "../../../domain/types/index.js";
import { ExecutionError } from "../../../domain/errors/index.js";
import type { AccountScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TokenRepository } from "../../ports/token-repository.js";

export interface Erc20Selector {
  contract: string;
}

/**
 * The ERC-20 half of the `token` group. Sibling of TronTokenService; `token list` is neither
 * family's, and lives in the neutral TokenBookService.
 */
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
      // Metadata only labels the number. A contract that answers balanceOf but not symbol() is
      // odd, not fatal, so a failed read degrades the labels rather than the balance.
      gateway.getErc20Metadata(input.contract).catch(() => ({})),
    ]);
    return { address, token: input.contract, balance, ...meta };
  }

  /**
   * Token metadata is read best-effort — a token that answers `decimals` but not `name` is still
   * a token, and the missing field is simply absent. But a contract that answers NOTHING is not a
   * token whose metadata is thin: it is not a token. Echoing the address back under `success`
   * reads as "this token has no metadata", which is a claim about a token that does not exist.
   *
   * `add` and `balance` already refuse the same address; this makes the third command agree.
   */
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

  /**
   * Adding is the one moment a token's decimals are checked against the chain: from here on
   * `tx send --token SYMBOL` takes the stored contract and decimals verbatim and never asks
   * again. An unreadable `decimals` is therefore refused rather than defaulted — a wrong one
   * would silently scale every later transfer by a power of ten.
   *
   * A `bytes32` symbol is not a defect of the same kind: the gateway already decodes that legacy
   * spelling, and a symbol is a label that no arithmetic depends on.
   */
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
      id: input.contract,
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
