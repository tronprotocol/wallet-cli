import type {
  AccountRef,
  EffectiveTokenEntry,
  NetworkDescriptor,
  TxInfoView,
  TxParties,
  TxStatusView,
} from "../../../domain/types/index.js";
import { ChainError, errorMessage, inputRef, UsageError } from "../../../domain/errors/index.js";
import { TRX_TRANSFER_BANDWIDTH_BURN_SUN } from "../../../domain/fees/tron.js";
import {
  fromBaseUnits,
  positiveBaseUnits,
  toBaseUnits,
  type Sun,
} from "../../../domain/amounts/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type {
  DecodedTronTransaction,
  TronGateway,
  TronTxInfo,
} from "../../ports/chain/tron-gateway.js";
import type { TokenRepository } from "../../ports/token-repository.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import {
  outcomeData,
  transactionMode,
  transactionRequiresSigner,
  type TransactionModeInput,
} from "../../services/transaction-mode.js";
import { tronConfirmation } from "../../services/tron-confirmation.js";
import { confirmationsOf } from "../../services/confirmations.js";
import { tronTransactionHooks } from "./multisig-authorization.js";
import type { RecipientResolver } from "../../services/recipient-resolver.js";
import { FAMILIES } from "../../../domain/family/index.js";

export interface TronSendInput extends TransactionModeInput {
  to: string;
  token?: string;
  contract?: string;
  assetId?: string;
  feeLimit: Sun;
  amount?: string;
  rawAmount?: string;
}

export class TronTransactionService {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly tokens: TokenRepository,
    private readonly pipeline: TxPipeline,
    private readonly recipients: RecipientResolver,
  ) {}

  async send(scope: TransactionScope, network: NetworkDescriptor, input: TronSendInput) {
    if (transactionRequiresSigner(input)) this.pipeline.assertCanSign(scope.activeAccount, "tron");
    const gateway = this.gateways.get(network, "tron");
    const recipient = this.recipients.resolve("tron", input.to);
    const resolved = await this.resolveTransfer(gateway, network.id, scope.activeAccount, input);
    positiveBaseUnits(resolved.rawAmount, "amount");
    const outcome = await this.pipeline.runTron({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      ...tronTransactionHooks(gateway),
      preflight: null,
      confirm: tronConfirmation(gateway, scope),
      build: (from) =>
        resolved.contract
          ? gateway.buildTrc20Transfer(
              from,
              recipient.address,
              resolved.contract,
              resolved.rawAmount,
              input.feeLimit,
            )
          : resolved.assetId
            ? gateway.buildTrc10Transfer(
                from,
                recipient.address,
                resolved.assetId,
                resolved.rawAmount,
              )
            : gateway.buildNativeTransfer(from, recipient.address, resolved.rawAmount),
      estimate: () =>
        resolved.contract
          ? gateway.estimateResources(
              scope.resolveAddress("tron"),
              resolved.contract,
              "transfer(address,uint256)",
              [
                { type: "address", value: recipient.address },
                { type: "uint256", value: resolved.rawAmount },
              ],
            )
          : Promise.resolve(
              resolved.assetId
                ? { feeModel: "tron-resource", note: "TRC10 transfer uses bandwidth only" }
                : {
                    feeModel: "tron-resource",
                    bandwidthBurnSunIfNoFreeze: TRX_TRANSFER_BANDWIDTH_BURN_SUN,
                  },
            ),
    });
    return {
      kind: "send" as const,
      ...outcomeData(outcome),
      rawAmount: resolved.rawAmount,
      token: resolved.tokenSymbol,
      decimals: resolved.decimals,
      contract: resolved.contract,
      assetId: resolved.assetId,
      to: recipient.address,
      ...(recipient.contactName ? { toContact: recipient.contactName } : {}),
    };
  }

  async status(network: NetworkDescriptor, txid: string): Promise<TxStatusView> {
    const gateway = this.gateways.get(network, "tron");
    // Transaction info alone cannot distinguish pending from unknown transactions.
    const [exists, info, head] = await Promise.all([
      gateway.getTransactionById(txid).then(
        (tx) => tx.txId !== undefined,
        // Treat lookup rejection as absent; the separate info request can still fail.
        () => false,
      ),
      // Propagate info-request failures instead of reporting not_found.
      gateway.getTransactionInfoById(txid),
      headBlockNumber(gateway),
    ]);
    const confirmed = info.blockNumber !== undefined;
    const failed = confirmed && info.execution === "failed";
    const state = confirmed ? (failed ? "failed" : "confirmed") : exists ? "pending" : "not_found";
    return {
      txid,
      state,
      confirmed,
      failed,
      blockNumber: info.blockNumber,
      ...confirmationsOf(head, info.blockNumber),
    };
  }

  async info(network: NetworkDescriptor, txid: string): Promise<TxInfoView> {
    const gateway = this.gateways.get(network, "tron");
    // Info and head reads are optional enrichment; transaction lookup determines existence.
    const [transaction, info, head] = await Promise.all([
      gateway.getTransactionById(txid),
      gateway.getTransactionInfoById(txid).catch(() => undefined),
      headBlockNumber(gateway),
    ]);
    return {
      txid,
      ...(await this.enrichParties(gateway, transaction.parties)),
      status: executionStatus(info, transaction.contractResult),
      blockNumber: info?.blockNumber,
      ...confirmationsOf(head, info?.blockNumber),
      energyUsed: info?.energyUsed,
      feeSun: info?.feeSun,
      transaction: transaction.raw,
      info: info?.raw ?? {},
    };
  }

  private lookupToken(networkId: string, account: AccountRef, symbol: string): EffectiveTokenEntry {
    const matches = this.tokens
      .effective(networkId, account)
      .filter((token) => token.symbol.toLowerCase() === symbol.toLowerCase());
    if (matches.length === 0) {
      throw new UsageError(
        "token_not_in_book",
        `token symbol not in address book on ${networkId}: ${symbol}`,
      );
    }
    if (matches.length > 1) {
      throw new UsageError(
        "ambiguous_token_symbol",
        errorMessage`token symbol ${symbol} matches multiple tokens; use ${inputRef("contract")} or ${inputRef("assetId")}`,
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
        throw new ChainError(
          "token_metadata_unavailable",
          `could not read decimals for ${contract}`,
        );
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
    return {
      rawAmount: input.rawAmount ?? toBaseUnits(input.amount!, FAMILIES.tron.nativeDecimals, "TRX"),
    };
  }

  private async enrichParties(
    gateway: TronGateway,
    decoded: DecodedTronTransaction,
  ): Promise<TxParties> {
    if (decoded.kind === "trx") {
      return {
        from: decoded.from,
        to: decoded.to,
        amount: fromBaseUnits(decoded.rawAmount ?? "0", FAMILIES.tron.nativeDecimals),
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
          amount:
            decimals === undefined ? decoded.rawAmount : fromBaseUnits(decoded.rawAmount, decimals),
        };
      } catch {
        return {
          from: decoded.from,
          to: decoded.to,
          contract: decoded.tokenContract,
          amount: decoded.rawAmount,
        };
      }
    }
    return { from: decoded.from, contract: decoded.tokenContract };
  }
}

// Head lookup is optional; failure omits confirmations.
async function headBlockNumber(gateway: TronGateway): Promise<number | undefined> {
  try {
    return (await gateway.getHeadBlock()).number;
  } catch {
    return undefined;
  }
}

// Lower-case node codes; the transaction's own code stands in when the receipt reports no result.
function executionStatus(
  info: TronTxInfo | undefined,
  transactionResult: string | undefined,
): string | undefined {
  if (info?.execution === "failed") return info.failureReason!.toLowerCase();
  if (info?.execution === "success") return "success";
  return transactionResult?.toLowerCase();
}
