// Signing closures handle device prechecks, prompts, and aborts for the payment flow.
import type { ChainFamily } from "../../domain/family/chain-family.js";
import type { TypedDataPayload, TypedDataSignature } from "../../domain/types/index.js";

export interface PayerSigner {
  // Base58 for TRON; 0x hex for EVM.
  readonly address: string;
  signTypedData(payload: TypedDataPayload): Promise<TypedDataSignature>;
  signTransaction(tx: unknown): Promise<unknown>;
}

export interface PayerPolicy {
  readonly family: ChainFamily;
  readonly warn?: (message: string) => void;
  // GasFree maxFee ceiling in base units; absent means no ceiling.
  readonly maxGasfreeFeeRaw?: string;
  // Whole-token ceiling converted using the token actually named by the signing payload.
  readonly maxGasfreeFee?: string;
  // Decimals by family-native token address; undefined when unknown.
  readonly gasfreeFeeDecimals?: (token: string) => number | undefined;
  // Unix seconds; defaults to the current wall clock.
  readonly now?: () => number;
  // Only approve(spender, MaxUint256) on these tokens from the payer; absent forbids TRON signing.
  readonly approveIntent?: { readonly spender: string; readonly tokens: readonly string[] };
  // Preserve signed-approval evidence even if payment later fails.
  readonly onApprovalSigned?: (approval: SignedApproval) => void;
}

export interface SignedApproval {
  readonly txId: string;
  readonly token: string;
  readonly spender: string;
  readonly allowance: "unlimited";
  readonly feeLimitSun: number;
}
