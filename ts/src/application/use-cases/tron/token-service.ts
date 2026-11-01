import { endedByDeadline, requestDispatchCheck } from "../../services/command-deadline.js";
import type { ExecutionDeadline } from "../../contracts/deadline.js";
import type { NetworkDescriptor, TokenEntry } from "../../../domain/types/index.js";
import { ExecutionError } from "../../../domain/errors/index.js";
import type { AccountScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron/tron-gateway.js";
import type { TokenRepository } from "../../ports/token-repository.js";

export interface TokenSelector {
  contract?: string;
  assetId?: string;
}

export class TronTokenService {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly tokens: TokenRepository,
  ) {}

  async balance(scope: AccountScope, network: NetworkDescriptor, input: TokenSelector) {
    const address = scope.resolveAddress("tron");
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline));
    const balance = input.contract
      ? await gateway.getTrc20Balance(input.contract, address)
      : await gateway.getTrc10Balance(input.assetId!, address);
    return {
      address,
      token: input.contract ?? input.assetId,
      balance,
      ...(await this.metadataBestEffort(scope.deadline, gateway, input)),
    };
  }

  info(deadline: ExecutionDeadline, network: NetworkDescriptor, input: TokenSelector) {
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(deadline));
    return input.contract
      ? gateway.getTokenInfo(input.contract)
      : gateway.getTrc10Info(input.assetId!);
  }

  async add(scope: AccountScope, network: NetworkDescriptor, input: TokenSelector) {
    const token = await this.fetchEntry(
      this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline)),
      input,
    );
    const action = this.tokens.add(network.id, scope.activeAccount, token);
    return { network: network.id, account: scope.activeAccount, action, token };
  }

  list(scope: AccountScope, network: NetworkDescriptor) {
    return {
      network: network.id,
      account: scope.activeAccount,
      tokens: this.tokens.effective(network.id, scope.activeAccount),
    };
  }

  remove(scope: AccountScope, network: NetworkDescriptor, input: TokenSelector) {
    const kind = input.contract ? ("trc20" as const) : ("trc10" as const);
    const id = input.contract ?? input.assetId!;
    return {
      network: network.id,
      account: scope.activeAccount,
      removed: this.tokens.remove(network.id, scope.activeAccount, kind, id),
    };
  }

  private async metadataBestEffort(
    deadline: ExecutionDeadline,
    gateway: TronGateway,
    input: TokenSelector,
  ): Promise<{ symbol?: string; decimals?: number }> {
    try {
      let symbol: string | undefined;
      let decimals: number | undefined;
      if (input.contract) {
        const info = await gateway.getTokenInfo(input.contract);
        symbol = (info.symbol ?? info.abbr ?? info.name) || undefined;
        decimals = info.decimals;
      } else {
        const info = await gateway.getTrc10Info(input.assetId!);
        symbol = (info.abbr ?? info.name) || undefined;
        decimals = Number(info.precision ?? 0);
      }
      return {
        ...(symbol ? { symbol } : {}),
        ...(decimals !== undefined ? { decimals } : {}),
      };
    } catch (error) {
      if (endedByDeadline(error, deadline)) throw error;
      return {};
    }
  }

  private async fetchEntry(gateway: TronGateway, input: TokenSelector): Promise<TokenEntry> {
    if (input.contract) {
      const info = await gateway.getTokenInfo(input.contract);
      const symbol = info.symbol;
      if (!symbol || info.decimals === undefined) {
        throw new ExecutionError(
          "token_metadata_unavailable",
          `could not read symbol/decimals for ${input.contract}`,
        );
      }
      return {
        kind: "trc20",
        id: input.contract,
        symbol,
        decimals: Number(info.decimals),
        name: info.name,
      };
    }
    const info = await gateway.getTrc10Info(input.assetId!);
    const symbol = info.abbr || info.name;
    if (!symbol) {
      throw new ExecutionError(
        "token_metadata_unavailable",
        `could not read TRC10 asset ${input.assetId}`,
      );
    }
    return {
      kind: "trc10",
      id: input.assetId!,
      symbol,
      decimals: Number(info.precision ?? 0),
      name: info.name || undefined,
    };
  }
}
