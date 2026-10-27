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
  amount: string;
  walletAddress: string;
  deviceType: "web";
  rechargeTarget?: BaiRechargeTarget;
}
export interface BaiReportTransactionInput {
  chain: string;
  txHash: string;
  rechargeTarget?: BaiRechargeTarget;
  amount?: string;
}
export type BaiReportResult =
  | { success: true; order: Record<string, unknown> }
  | { success: false; code: string; message?: string };
export interface BaiRechargeApi {
  resolveTarget(
    identifier: string,
  ): Promise<{ type: "personal"; targetId: string; displayLabel: string }>;
  isBound(input: BaiWalletBindingInput): Promise<boolean>;
  bind(input: BaiBindWalletInput): Promise<{ userId: string; address: string; chain: string }>;
  // Do not infer a payment destination from the untyped order response.
  createOrder(input: BaiCreateOrderInput): Promise<Record<string, unknown>>;
  reportTxHash(input: BaiReportTransactionInput): Promise<BaiReportResult>;
}

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

// Allow indexing between payment and its single report.
export interface BaiReportDelay {
  readonly initialDelayMs: number;
  wait(ms: number): Promise<void>;
}
