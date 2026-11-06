import { endedByDeadline, requestDispatchCheck } from "../services/command-deadline.js";
import type { ExecutionDeadline } from "../contracts/deadline.js";
import type { AccountStore } from "../ports/account-store.js";
import type { ChainGatewayProvider } from "../ports/chain/gateway-provider.js";
import type {
  BaiRechargeApi,
  BaiReportDelay,
  BaiRechargeConfig,
  BaiRechargeTarget,
} from "../ports/bai-recharge.js";
import { BaiRechargeFlow, reportBaiTransaction } from "./bai-recharge-flow.js";
import { requireBaiChain, type BaiWalletBinding } from "./bai-wallet-binding.js";
import type { BaiApi, BaiPageInput } from "../ports/bai-api.js";
import { errorMessage, inputRef, UsageError } from "../../domain/errors/index.js";
import {
  assertBaiRechargeMinimum,
  assertBaiRechargePrecision,
  baiRechargeAmount,
} from "../../domain/bai/recharge-policy.js";
import type { X402RoundtripPort, X402ServeInput } from "../ports/x402-server.js";
import { baiPaymentResult } from "../services/bai-payment-result.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type { NetworkDescriptor } from "../../domain/types/index.js";
import { sameAddress, type ChainFamily } from "../../domain/family/index.js";
import { isBaiTxHash } from "../../domain/bai/chains.js";

export interface BaiListCommandInput {
  cursor?: string;
  limit: number;
  offset: number;
  sort: "asc" | "desc";
}

// The payer's token balance reader of each family, for the dry-run preview.
const TOKEN_BALANCE: Record<
  ChainFamily,
  (
    deadline: ExecutionDeadline,
    gateways: ChainGatewayProvider,
    network: NetworkDescriptor,
    asset: string,
    owner: string,
  ) => Promise<string>
> = {
  evm: (deadline, gateways, network, asset, owner) =>
    gateways.get(network, "evm", requestDispatchCheck(deadline)).getErc20Balance(asset, owner),
  tron: (deadline, gateways, network, asset, owner) =>
    gateways.get(network, "tron", requestDispatchCheck(deadline)).getTrc20Balance(asset, owner),
};

export class BaiService {
  constructor(
    private readonly api: BaiApi,
    private readonly now: () => Date = () => new Date(),
    private readonly payments?: X402RoundtripPort,
    private readonly binding?: Pick<BaiWalletBinding, "bind">,
    private readonly rechargeApi?: BaiRechargeApi,
    private readonly rechargeConfig?: BaiRechargeConfig,
    private readonly reportDelay?: BaiReportDelay,
    private readonly gateways?: ChainGatewayProvider,
    private readonly accounts?: Pick<AccountStore, "resolveAccount">,
  ) {}

  async recharge(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: {
      amount: string;
      token: string;
      to?: string;
      apiKey?: string;
      dryRun?: boolean;
      scheme?: "exact" | "exact_gasfree";
      gasfreeRelay?: string;
      maxGasfreeFee?: string;
      maxGasfreeFeeRaw?: string;
    },
  ) {
    const amount = baiRechargeAmount(input.amount);
    assertBaiRechargeMinimum(input.token, amount);
    assertBaiRechargePrecision(amount);
    const chain = requireBaiChain(network);
    if (!input.apiKey) {
      throw new UsageError(
        "bai_credentials_missing",
        "configure baiApiKey before using B.AI recharge",
      );
    }
    if (!this.payments || !this.rechargeApi || !this.rechargeConfig) {
      throw new UsageError("invalid_option", "B.AI recharge is not available in this runtime");
    }
    const expectedPayTo = this.rechargeConfig.payTo[chain];
    if (!expectedPayTo?.trim()) {
      throw new UsageError(
        "unsupported_network_capability",
        "No trusted B.AI recharge destination for this network",
      );
    }
    const paymentInput: X402ServeInput = {
      payTo: expectedPayTo,
      amount: input.amount,
      token: input.token,
      scheme: input.scheme ?? "exact",
      dryRun: input.dryRun,
      gasfreeRelay: input.gasfreeRelay,
      maxGasfreeFee: input.maxGasfreeFee,
      maxGasfreeFeeRaw: input.maxGasfreeFeeRaw,
      host: "127.0.0.1",
      port: 0,
      facilitatorUrl: this.rechargeConfig.facilitatorUrl,
    };
    this.payments.validate(network, paymentInput);
    // Reject ambiguous account selectors before binding checks.
    this.accounts?.resolveAccount(scope.activeAccount, network.family);
    const payer = scope.resolveAddress(network.family);
    scope.emit({ type: "activity", message: "Checking B.AI wallet binding…" });
    const bound = await this.rechargeApi.isBound(
      { chain, address: payer },
      requestDispatchCheck(scope.deadline),
    );
    if (!input.dryRun) {
      this.payments.prepare(scope, network);
      if (!bound) {
        if (!this.binding)
          throw new UsageError("invalid_option", "B.AI wallet binding is unavailable");
        await this.binding.bind(scope, network, payer, this.rechargeApi);
      }
    } else if (!bound) {
      scope.warn(
        "Wallet is not bound to B.AI; a real recharge will require a binding signature before payment.",
      );
    }
    const identifier = input.to?.trim();
    const self = !identifier || sameAddress(network.family, identifier, payer);
    let rechargeTarget: BaiRechargeTarget | undefined;
    if (!self) {
      scope.emit({ type: "activity", message: "Checking the recharge recipient…" });
      const resolved = await this.rechargeApi.resolveTarget(
        identifier!,
        requestDispatchCheck(scope.deadline),
      );
      rechargeTarget = {
        input: { type: "personal", identifier: identifier! },
        confirmedTarget: { type: "personal", targetId: resolved.targetId },
      };
    }
    if (input.dryRun) {
      const inspection = await this.payments.roundtrip(scope, network, paymentInput);
      let balance: { tokenRaw: string; nativeRaw: string } | null = null;
      const asset = inspection.serve.asset;
      if (this.gateways && typeof asset === "string") {
        try {
          const tokenRaw = await TOKEN_BALANCE[network.family](
            scope.deadline,
            this.gateways,
            network,
            asset,
            payer,
          );
          balance = {
            tokenRaw,
            nativeRaw: await this.gateways
              .client(network, requestDispatchCheck(scope.deadline))
              .getNativeBalance(payer),
          };
        } catch (error) {
          if (endedByDeadline(error, scope.deadline)) throw error;
          scope.warn("Wallet balance is unavailable; preview does not establish sufficient funds.");
        }
      }
      return {
        dryRun: true,
        bindingRequired: !bound,
        network: network.id,
        token: input.token,
        amount: input.amount,
        payer,
        payTo: expectedPayTo,
        scheme: paymentInput.scheme,
        rawAmount: inspection.serve.rawAmount,
        rechargeTarget: rechargeTarget ?? { type: "self", walletAddress: payer },
        payment: inspection.pay,
        balance,
        estimatedFee: null,
        feeLimit: { amount: input.maxGasfreeFee, rawAmount: input.maxGasfreeFeeRaw },
        warning:
          "Preview only; final network/relay fee is unavailable until payment authorization. Balance refers to the payer wallet, not its GasFree account. No order or payment was created.",
      };
    }
    const flow = new BaiRechargeFlow(
      this.rechargeApi,
      {
        pay: async () => {
          const result = await this.payments!.roundtrip(scope, network, paymentInput);
          return {
            ...baiPaymentResult({ ...result.pay, settlement: result.settlement }, network.id),
            chain,
          };
        },
      },
      this.reportDelay,
      (message) => scope.emit({ type: "activity", message }),
    );
    const result = await flow.execute(scope.deadline, {
      channel: "crypto",
      chain,
      tokenName: input.token,
      amount,
      walletAddress: payer,
      deviceType: "web",
      ...(rechargeTarget ? { rechargeTarget } : {}),
    });
    return { ...result, network: network.id, token: input.token, amount: input.amount, payer };
  }

  async rechargeReport(
    deadline: ExecutionDeadline,
    input: {
      chain: "tron" | "bnb" | "base";
      txHash: string;
      amount?: string;
      to?: string;
      targetId?: string;
    },
  ) {
    if (!this.rechargeApi)
      throw new UsageError("invalid_option", "B.AI recharge reporting is unavailable");
    if (!["tron", "bnb", "base"].includes(input.chain))
      throw new UsageError(
        "invalid_value",
        "Recharge report requires the original tron, bnb or base chain",
      );
    if (!isBaiTxHash(input.chain, input.txHash))
      throw new UsageError("invalid_value", "Invalid transaction hash for the recharge chain");
    const to = input.to?.trim();
    const targetId = input.targetId?.trim();
    if (
      (input.to !== undefined || input.targetId !== undefined) &&
      (!to || !targetId || to.length > 320 || targetId.length > 320)
    ) {
      throw new UsageError(
        "invalid_value",
        errorMessage`Recipient recovery requires both the original ${inputRef("to")} and ${inputRef("targetId")}`,
      );
    }
    const amount = input.amount === undefined ? undefined : baiRechargeAmount(input.amount);
    return reportBaiTransaction(deadline, this.rechargeApi, {
      chain: input.chain,
      txHash: input.txHash,
      ...(amount === undefined ? {} : { amount }),
      ...(to && targetId
        ? {
            rechargeTarget: {
              input: { type: "personal", identifier: to },
              confirmedTarget: { type: "personal", targetId },
            },
          }
        : {}),
    });
  }

  async usage(deadline: ExecutionDeadline) {
    const summary = await this.api.status(requestDispatchCheck(deadline));
    const current = summary.monthlyChart.at(-1);
    return {
      credits: summary.pointsBalance,
      thisMonth: {
        month: current?.month ?? utcMonth(this.now()),
        credits: summary.monthlySpent,
      },
      trend: summary.monthlyChart.map((item) => ({ month: item.month, credits: item.points })),
    };
  }

  async usageList(deadline: ExecutionDeadline, input: BaiListCommandInput) {
    const result = await this.api.usageList(
      {
        ...pageInput(input),
        ...(input.cursor ? { cursor: input.cursor } : {}),
      },
      requestDispatchCheck(deadline),
    );
    return {
      records: result.items,
      pagination: {
        offset: input.offset,
        limit: input.limit,
        total: result.total,
        ...(result.hasMore === undefined ? {} : { hasMore: result.hasMore }),
        ...(result.nextCursor === undefined ? {} : { nextCursor: result.nextCursor }),
      },
    };
  }

  async rechargeList(deadline: ExecutionDeadline, input: BaiListCommandInput) {
    const limit = Math.min(input.limit, 100);
    const page = Math.floor(input.offset / limit) + 1;
    const skip = input.offset % limit;
    const request = { page, pageSize: limit, sortOrder: input.sort };
    const result = await this.api.rechargeList(request, requestDispatchCheck(deadline));
    let orders = result.items.slice(skip);
    if (
      skip > 0 &&
      result.items.length === limit &&
      (result.total === undefined || input.offset + orders.length < result.total)
    ) {
      const next = await this.api.rechargeList(
        { ...request, page: page + 1 },
        requestDispatchCheck(deadline),
      );
      orders = orders.concat(next.items).slice(0, limit);
    }
    return {
      orders,
      pagination: { offset: input.offset, limit, total: result.total },
      warnings:
        input.limit > limit
          ? [
              `Recharge order limit reduced from ${input.limit} to ${limit} to match the B.AI server limit.`,
            ]
          : [],
    };
  }
}

function pageInput(input: BaiListCommandInput): BaiPageInput {
  if (input.offset % input.limit !== 0) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("offset")} must be a multiple of ${inputRef("limit")} for the B.AI page API`,
    );
  }
  return {
    page: input.offset / input.limit + 1,
    pageSize: input.limit,
    sortOrder: input.sort,
  };
}

function utcMonth(date: Date): string {
  return date.toISOString().slice(0, 7);
}
