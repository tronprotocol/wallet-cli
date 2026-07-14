import type { AccountRef, EffectiveTokenEntry, NetworkDescriptor, TxInfoView, TxParties, TxStatusView } from "../../../domain/types/index.js";
import { UsageError } from "../../../domain/errors/index.js";
import { fromBaseUnits, toBaseUnits } from "../../../domain/amounts/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { DecodedTronTransaction, TronGateway, TronTxInfo } from "../../ports/chain/tron-gateway.js";
import type { TokenRepository } from "../../ports/token-repository.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import { outcomeData, transactionMode, type TransactionModeInput } from "../../services/transaction-mode.js";
import { stageTronBroadcast, tronConfirmation } from "../../services/tron-confirmation.js";

export interface TronSendInput extends TransactionModeInput {
  to: string;
  token?: string;
  contract?: string;
  assetId?: string;
  feeLimit: string;
  amount?: string;
  rawAmount?: string;
}

export class TronTransactionService {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly tokens: TokenRepository,
    private readonly pipeline: TxPipeline,
  ) {}

  async send(scope: TransactionScope, network: NetworkDescriptor, input: TronSendInput) {
    this.pipeline.assertCanSign(scope.activeAccount, "tron");
    const gateway = this.gateways.get(network, "tron");
    const resolved = await this.resolveTransfer(
      gateway,
      network.id,
      scope.activeAccount,
      input,
    );
    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      confirm: tronConfirmation(gateway, scope),
      build: (from) => resolved.contract
        ? gateway.buildTrc20Transfer(from, input.to, resolved.contract, resolved.rawAmount, input.feeLimit)
        : resolved.assetId
          ? gateway.buildTrc10Transfer(from, input.to, resolved.assetId, resolved.rawAmount)
          : gateway.buildNativeTransfer(from, input.to, resolved.rawAmount),
      estimate: () => resolved.contract
        ? gateway.estimateResources(scope.resolveAddress("tron"), resolved.contract, "transfer(address,uint256)", [
            { type: "address", value: input.to },
            { type: "uint256", value: resolved.rawAmount },
          ])
        : Promise.resolve(resolved.assetId
          ? { feeModel: "tron-resource", note: "TRC10 transfer uses bandwidth only" }
          : { feeModel: "tron-resource", bandwidthBurnSunIfNoFreeze: 100000 }),
    });
    return {
      kind: "send" as const,
      ...outcomeData(outcome),
      rawAmount: resolved.rawAmount,
      token: resolved.tokenSymbol,
      decimals: resolved.decimals,
      contract: resolved.contract,
      assetId: resolved.assetId,
      to: input.to,
    };
  }

  async broadcast(scope: TransactionScope, network: NetworkDescriptor, signed: unknown) {
    const gateway = this.gateways.get(network, "tron");
    const result = await gateway.broadcast(signed);
    return {
      kind: "broadcast" as const,
      ...(await stageTronBroadcast(gateway, scope, result)),
    };
  }

  async status(network: NetworkDescriptor, txid: string): Promise<TxStatusView> {
    const gateway = this.gateways.get(network, "tron");
    // Two endpoints, in parallel, because getTransactionInfo alone can't tell "unconfirmed" from
    // "never existed" — it returns {} for both. getTransactionById distinguishes them: it knows a
    // broadcast tx immediately (mempool), and throws "Transaction not found" for an unknown hash.
    // getTransactionInfo only fills in once the tx is in a (solidified) block — that's what promotes
    // pending → confirmed/failed.
    const [exists, info] = await Promise.all([
      gateway.getTransactionById(txid).then((tx) => tx?.txID !== undefined, () => false),
      gateway.getTransactionInfoById(txid).catch((): TronTxInfo => ({})),
    ]);
    const confirmed = info.blockNumber !== undefined;
    const result = info.receipt?.result;
    const failed = confirmed && result !== undefined && result !== "SUCCESS";
    const state = confirmed ? (failed ? "failed" : "confirmed") : exists ? "pending" : "not_found";
    return { txid, state, confirmed, failed, blockNumber: info.blockNumber };
  }

  async info(network: NetworkDescriptor, txid: string): Promise<TxInfoView> {
    const gateway = this.gateways.get(network, "tron");
    // The transaction is the source of truth for existence; the info (block/fee/energy) is
    // enrichment. Mirror getContractMetadata's best-effort shape: a missing/failed info must not
    // sink the command for a tx that exists (e.g. still pending, or a flaky solidity node).
    const [transaction, info] = await Promise.all([
      gateway.getTransactionById(txid),
      gateway.getTransactionInfoById(txid).catch((): TronTxInfo => ({})),
    ]);
    return {
      txid,
      ...(await this.enrichParties(gateway, gateway.decodeTransaction(transaction))),
      status: info.receipt?.result ?? transaction.ret?.[0]?.contractRet,
      blockNumber: info.blockNumber,
      energyUsed: info.receipt?.energy_usage_total,
      feeSun: info.fee,
      transaction,
      info,
    };
  }

  private lookupToken(networkId: string, account: AccountRef, symbol: string): EffectiveTokenEntry {
    const matches = this.tokens.effective(networkId, account)
      .filter((token) => token.symbol.toLowerCase() === symbol.toLowerCase());
    if (matches.length === 0) {
      throw new UsageError("token_not_in_book", `token symbol not in address book on ${networkId}: ${symbol}`);
    }
    if (matches.length > 1) {
      throw new UsageError(
        "ambiguous_token_symbol",
        `token symbol ${symbol} matches multiple tokens; use --contract or --asset-id`,
      );
    }
    return matches[0]!;
  }

  private async resolveTransfer(
    gateway: TronGateway,
    networkId: string,
    account: AccountRef,
    input: TronSendInput,
  ): Promise<{
    contract?: string;
    assetId?: string;
    rawAmount: string;
    tokenSymbol?: string;
    decimals?: number;
  }> {
    let contract = input.contract;
    let assetId = input.assetId;
    let decimals: number | undefined;
    let tokenSymbol: string | undefined;
    if (input.token) {
      const token = this.lookupToken(networkId, account, input.token);
      if (token.kind !== "trc20" && token.kind !== "trc10") {
        throw new UsageError("invalid_value", `${input.token} is not a TRON token on ${networkId}`);
      }
      tokenSymbol = token.symbol;
      decimals = token.decimals;
      if (token.kind === "trc20") contract = token.id;
      else assetId = token.id;
    }
    if (input.rawAmount !== undefined) {
      return { contract, assetId, rawAmount: input.rawAmount, tokenSymbol, decimals };
    }
    if (contract) {
      if (decimals === undefined) {
        const info = await gateway.getTokenInfo(contract);
        decimals = info.decimals;
        if (!tokenSymbol && typeof info.symbol === "string") tokenSymbol = info.symbol;
      }
      if (decimals === undefined) {
        throw new UsageError("token_metadata_unavailable", `could not read decimals for ${contract}`);
      }
      return {
        contract,
        rawAmount: toBaseUnits(input.amount!, decimals, "token"),
        tokenSymbol,
        decimals,
      };
    }
    if (assetId) {
      if (decimals === undefined) {
        const info = await gateway.getTrc10Info(assetId);
        decimals = Number(info.precision ?? 0);
        const symbol = info.abbr ?? info.name;
        if (!tokenSymbol && symbol !== undefined) tokenSymbol = String(symbol);
      }
      return {
        assetId,
        rawAmount: toBaseUnits(input.amount!, decimals, "TRC10 token"),
        tokenSymbol,
        decimals,
      };
    }
    return { rawAmount: input.rawAmount ?? toBaseUnits(input.amount!, 6, "TRX") };
  }

  private async enrichParties(gateway: TronGateway, decoded: DecodedTronTransaction): Promise<TxParties> {
    if (decoded.kind === "trx") {
      return {
        from: decoded.from,
        to: decoded.to,
        amount: fromBaseUnits(decoded.rawAmount ?? "0", 6),
        symbol: "TRX",
      };
    }
    if (decoded.kind === "trc10") {
      return { from: decoded.from, to: decoded.to, amount: decoded.rawAmount };
    }
    if (decoded.kind === "trc20" && decoded.tokenContract && decoded.rawAmount !== undefined) {
      try {
        const token = await gateway.getTokenInfo(decoded.tokenContract);
        const decimals = token.decimals;
        return {
          from: decoded.from,
          to: decoded.to,
          contract: decoded.tokenContract,
          symbol: typeof token.symbol === "string" ? token.symbol : undefined,
          amount: decimals === undefined ? decoded.rawAmount : fromBaseUnits(decoded.rawAmount, decimals),
        };
      } catch {
        return { from: decoded.from, to: decoded.to, contract: decoded.tokenContract, amount: decoded.rawAmount };
      }
    }
    return { from: decoded.from, contract: decoded.tokenContract };
  }
}
