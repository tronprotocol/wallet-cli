/** Confirmed credit recipient; distinct from the authenticated payer's wallet binding. */
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
  amount: number;
  walletAddress: string;
  deviceType: "web";
  rechargeTarget?: BaiRechargeTarget;
}
export interface BaiReportTransactionInput {
  chain: string;
  txHash: string;
  rechargeTarget?: BaiRechargeTarget;
  /** Listed in the parameter table but omitted in the documentation's request example. */
  amount?: number;
}
export type BaiReportResult =
  { success: true; order: Record<string, unknown> } | { success: false; code: string };
export interface BaiRechargeApi {
  resolveTarget(
    identifier: string,
  ): Promise<{ type: "personal"; targetId: string; displayLabel: string }>;
  isBound(input: BaiWalletBindingInput): Promise<boolean>;
  bind(input: BaiBindWalletInput): Promise<{ userId: string; address: string; chain: string }>;
  /** Response contract is not documented yet. Do not infer a payment destination. */
  createOrder(input: BaiCreateOrderInput): Promise<Record<string, unknown>>;
  reportTxHash(input: BaiReportTransactionInput): Promise<BaiReportResult>;
}

/** A payment implementation verified against B.AI's preorder destination and payer rules. */
export interface BaiRechargePayment {
  pay(
    order: Record<string, unknown>,
    input: BaiCreateOrderInput,
  ): Promise<{
    txHash: string;
    chain: string;
    payer: string;
  }>;
}
