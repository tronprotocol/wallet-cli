import type {
  BaiRechargeApi,
  BaiReportRetry,
  BaiRechargeConfig,
  BaiRechargeTarget,
} from "../ports/bai-recharge.js";
import { BaiRechargeFlow, reportBaiTransaction } from "./bai-recharge-flow.js";
import { requireBaiChain } from "./bai-credential-setup.js";
import type { BaiBindingStore } from "../ports/bai-binding-store.js";
import type { BaiApi, BaiPageInput } from "../ports/bai-api.js";
import { UsageError } from "../../domain/errors/index.js";
import { assertBaiRechargeMinimum, baiRechargeAmount } from "../../domain/bai/recharge-policy.js";
import type { X402RoundtripPort, X402ServeInput } from "../ports/x402-server.js";
import { baiPaymentResult } from "../services/bai-payment-result.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type { NetworkDescriptor } from "../../domain/types/index.js";

export interface BaiListCommandInput {
  cursor?: string;
  limit: number;
  offset: number;
  sort: "asc" | "desc";
}

export class BaiService {
  constructor(
    private readonly api: BaiApi,
    private readonly now: () => Date = () => new Date(),
    private readonly payments?: X402RoundtripPort,
    private readonly bindings?: BaiBindingStore,
    private readonly rechargeApi?: BaiRechargeApi,
    private readonly rechargeConfig?: BaiRechargeConfig,
    private readonly reportRetry?: BaiReportRetry,
  ) {}

  async recharge(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: { amount: string; token: string; to?: string; apiKey?: string },
  ) {
    if (!input.apiKey) {
      throw new UsageError(
        "bai_credentials_missing",
        "configure baiApiKey before using B.AI recharge",
      );
    }
    if (!this.bindings)
      throw new UsageError("invalid_option", "B.AI recharge binding verification is unavailable");
    const chain = requireBaiChain(network);
    const payer = scope.resolveAddress(network.family);
    if (!this.bindings.isConfirmed(input.apiKey, chain, payer)) {
      throw new UsageError(
        "invalid_value",
        "Confirm this API key and payer wallet first by configuring baiApiKey with --api-key-stdin for the selected account/network. No payment was sent",
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
    const amount = baiRechargeAmount(input.amount);
    assertBaiRechargeMinimum(input.token, input.amount);
    const paymentInput: X402ServeInput = {
      payTo: expectedPayTo,
      amount: input.amount,
      token: input.token,
      scheme: "exact",
      host: "127.0.0.1",
      port: 0,
      facilitatorUrl: this.rechargeConfig.facilitatorUrl,
    };
    this.payments.validate(network, paymentInput);
    const identifier = input.to?.trim();
    const self =
      !identifier ||
      (network.family === "evm"
        ? identifier.toLowerCase() === payer.toLowerCase()
        : identifier === payer);
    let rechargeTarget: BaiRechargeTarget | undefined;
    if (!self) {
      const resolved = await this.rechargeApi.resolveTarget(identifier!);
      rechargeTarget = {
        input: { type: "personal", identifier: identifier! },
        confirmedTarget: { type: "personal", targetId: resolved.targetId },
      };
    }
    const flow = new BaiRechargeFlow(
      this.rechargeApi,
      {
        pay: async () => {
          const result = await this.payments!.roundtrip(scope, network, paymentInput);
          return { ...baiPaymentResult(result.pay, network.id), chain };
        },
      },
      this.reportRetry,
    );
    const result = await flow.execute({
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

  async rechargeReport(input: {
    chain: "tron" | "bnb" | "base";
    txHash: string;
    amount?: string;
    to?: string;
    targetId?: string;
  }) {
    if (!this.rechargeApi)
      throw new UsageError("invalid_option", "B.AI recharge reporting is unavailable");
    if (!["tron", "bnb", "base"].includes(input.chain))
      throw new UsageError(
        "invalid_value",
        "Recharge report requires the original tron, bnb or base chain",
      );
    const hashPattern = input.chain === "tron" ? /^[0-9a-fA-F]{64}$/ : /^0x[0-9a-fA-F]{64}$/;
    if (!hashPattern.test(input.txHash))
      throw new UsageError("invalid_value", "Invalid transaction hash for the recharge chain");
    const to = input.to?.trim();
    const targetId = input.targetId?.trim();
    if (
      (input.to !== undefined || input.targetId !== undefined) &&
      (!to || !targetId || to.length > 320 || targetId.length > 320)
    ) {
      throw new UsageError(
        "invalid_value",
        "Recipient recovery requires both the original --to and --target-id",
      );
    }
    const amount = input.amount === undefined ? undefined : baiRechargeAmount(input.amount);
    return reportBaiTransaction(
      this.rechargeApi,
      {
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
      },
      this.reportRetry,
    );
  }

  async status() {
    const summary = await this.api.status();
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

  async usage() {
    return this.status();
  }

  async usageList(input: BaiListCommandInput) {
    const result = await this.api.usageList({
      ...pageInput(input),
      ...(input.cursor ? { cursor: input.cursor } : {}),
    });
    return {
      records: result.items.map((row) => ({
        id: optionalString(row.id),
        createdAt: optionalString(row.created_at ?? row.createdAt),
        model: optionalString(row.model),
        inputTokens: optionalScalar(row.input_tokens ?? row.inputTokens),
        outputTokens: optionalScalar(row.output_tokens ?? row.outputTokens),
        totalTokens: optionalScalar(row.total_tokens ?? row.totalTokens),
        credits: optionalScalar(row.cost_points ?? row.credits),
        latencyMs: secondsToMilliseconds(row.duration_sec ?? row.durationSec),
        source: optionalString(row.source_type ?? row.source),
      })),
      pagination: {
        offset: input.offset,
        limit: input.limit,
        total: result.total,
        ...(result.hasMore === undefined ? {} : { hasMore: result.hasMore }),
        ...(result.nextCursor === undefined ? {} : { nextCursor: result.nextCursor }),
      },
    };
  }

  async rechargeList(input: BaiListCommandInput) {
    const result = await this.api.rechargeList(pageInput(input));
    return {
      orders: result.items,
      pagination: { offset: input.offset, limit: input.limit, total: result.total },
    };
  }
}

function pageInput(input: BaiListCommandInput): BaiPageInput {
  if (input.offset % input.limit !== 0) {
    throw new UsageError(
      "invalid_value",
      `--offset must be a multiple of --limit for the B.AI page API`,
    );
  }
  return {
    page: input.offset / input.limit + 1,
    pageSize: input.limit,
    sortBy: "created_at",
    sortOrder: input.sort,
  };
}

function utcMonth(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalScalar(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function secondsToMilliseconds(value: unknown): number | undefined {
  const seconds = typeof value === "number" ? value : Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : undefined;
}
