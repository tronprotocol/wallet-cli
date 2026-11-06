import type { DispatchCheck } from "../contracts/deadline.js";
import type { BaiRechargeAmount } from "../../domain/bai/recharge-policy.js";

// Trusted deployment settings; not user configuration.
export interface BaiRechargeConfig {
  readonly facilitatorUrl: string;
  readonly payTo: Readonly<Partial<Record<string, string>>>;
}

// Credit recipient, separate from the authenticated payer's wallet binding.
export interface BaiRechargeTarget {
  input: { type: "personal"; identifier: string };
  confirmedTarget: { type: "personal"; targetId: string };
}
export interface BaiWalletBindingInput {
  address: string;
  chain: string;
}
export interface BaiBindWalletInput extends BaiWalletBindingInput {
  message: string;
  signature: string;
  version?: number;
}
export interface BaiCreateOrderInput {
  channel: "crypto";
  chain: string;
  tokenName: string;
  amount: BaiRechargeAmount;
  walletAddress: string;
  deviceType: "web";
  rechargeTarget?: BaiRechargeTarget;
}
export interface BaiReportTransactionInput {
  chain: string;
  txHash: string;
  rechargeTarget?: BaiRechargeTarget;
  amount?: BaiRechargeAmount;
}

declare const baiRawOrder: unique symbol;

// B.AI order JSON passed through verbatim; inner layers never read it.
export interface BaiRawOrder {
  readonly [baiRawOrder]: true;
}

// A created preorder, normalized; orderId is absent when B.AI returned no usable id.
export interface BaiCreatedOrder {
  readonly orderId?: string;
}

export type BaiReportResult =
  { success: true; order: BaiRawOrder } | { success: false; code: string; message?: string };
export interface BaiRechargeApi {
  resolveTarget(
    identifier: string,
    check: DispatchCheck,
  ): Promise<{ type: "personal"; targetId: string; displayLabel: string }>;
  isBound(input: BaiWalletBindingInput, check: DispatchCheck): Promise<boolean>;
  bind(
    input: BaiBindWalletInput,
    check: DispatchCheck,
  ): Promise<{ userId: string; address: string; chain: string }>;
  // Do not infer a payment destination from the order response.
  createOrder(input: BaiCreateOrderInput, check: DispatchCheck): Promise<BaiCreatedOrder>;
  reportTxHash(input: BaiReportTransactionInput, check: DispatchCheck): Promise<BaiReportResult>;
}

export interface BaiRechargePayment {
  pay(
    order: BaiCreatedOrder,
    input: BaiCreateOrderInput,
  ): Promise<{
    txHash: string;
    chain: string;
    payer: string;
  }>;
}

// Allow indexing between payment and its single report.
export interface BaiReportDelay {
  readonly initialDelayMs: number;
  // Ends early, resolving or rejecting, when the signal aborts.
  wait(ms: number, signal: AbortSignal): Promise<void>;
}
