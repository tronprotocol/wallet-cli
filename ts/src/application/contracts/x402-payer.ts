// Signing closures handle device prechecks, prompts, and aborts for the payment flow.
import type {
  EvmSignedTx,
  EvmUnsignedTx,
  TronTransactionArtifact,
  TypedDataPayload,
  TypedDataSignature,
} from "../../domain/types/index.js";

export interface PayerSigner {
  // Base58 for TRON; 0x hex for EVM.
  readonly address: string;
  // Refuses a payload for another payer, over the fee ceiling, or past its deadline.
  signTypedData(payload: TypedDataPayload): Promise<TypedDataSignature>;
  // EVM only: signs `tx` only when `decoded` is the Permit2 approve the payment policy allows.
  signTransaction(tx: EvmUnsignedTx, decoded: DecodedEvmApprove): Promise<EvmSignedTx>;
  // Signs `tx` only when `decoded` is the Permit2 approve the payment policy allows.
  signPermit2Approval(
    tx: TronTransactionArtifact,
    decoded: DecodedTronApprove,
  ): Promise<SignedPermit2Approval>;
}

// The adapter's reading of a TRON transaction the SDK asks to sign; absent fields were missing or malformed.
export interface DecodedTronApprove {
  readonly contractCount: number;
  readonly contractType?: string;
  // Base58.
  readonly owner?: string;
  // Base58 token contract.
  readonly token?: string;
  // SUN; "0" when the transaction sets none.
  readonly callValueSun: string;
  // Present only when the calldata is approve(address,uint256) with a MaxUint256 amount.
  readonly unlimitedApproveSpender?: string;
  // A safe integer; absent when the transaction sets none or a malformed one.
  readonly feeLimitSun?: number;
}

// The adapter's reading of an EVM transaction the SDK asks to sign; absent fields were missing or malformed.
export interface DecodedEvmApprove {
  // Checksummed contract the transaction calls; absent for a contract creation.
  readonly token?: string;
  // Wei; "0" when the transaction sets none.
  readonly valueWei: string;
  // Checksummed; present only when the calldata is approve(address,uint256) with a MaxUint256 amount.
  readonly unlimitedApproveSpender?: string;
}

export interface SignedPermit2Approval {
  readonly signed: TronTransactionArtifact;
  readonly approval: Omit<SignedApproval, "txId">;
}

// Network facts the payment adapter knows and the payment policy applies.
export interface X402PaymentFacts {
  // Absent when the network has no Permit2 deployment.
  readonly permit2?: {
    // Permit2 contract: base58 on TRON, checksummed on EVM.
    readonly spender: string;
    // Token contracts the payment flow may approve, in the same form.
    readonly tokens: readonly string[];
  };
  // Decimals by family-native token address; undefined when unknown.
  tokenDecimals(token: string): number | undefined;
}

export interface Permit2ApproveRequest {
  // Base58 token contract.
  readonly token: string;
  // Base58 Permit2 contract.
  readonly spender: string;
  // Base units the payment needs.
  readonly requiredAllowance: string;
  // Current on-chain allowance in base units.
  readAllowance(): Promise<string>;
  // Receives the approval's transaction id when its broadcast request is dispatched, before the
  // node answers.
  onSubmitted(txId: string): void;
  // Receives the approval once it is confirmed, before the allowance is read.
  onConfirmed(approval: SignedApproval): void;
}

export interface Permit2Approver {
  // Submits approve(spender, MaxUint256) and resolves only once it is confirmed and the allowance landed.
  approve(request: Permit2ApproveRequest): Promise<SignedApproval>;
}

export interface SignedApproval {
  readonly txId: string;
  readonly token: string;
  readonly spender: string;
  readonly allowance: "unlimited";
  // A safe integer within the approve budget.
  readonly feeLimitSun: number;
}
