import type {
  DecodedEvmApprove,
  DecodedTronApprove,
  PayerSigner,
  SignedApproval,
} from "../../../application/contracts/x402-payer.js";
import type {
  EvmUnsignedTx,
  TronTransactionArtifact,
  TypedDataPayload,
} from "../../../domain/types/index.js";
import { ChainError } from "../../../domain/errors/index.js";
import { EvmAddress, tronHexFromHash20, tronHexToBase58 } from "../../../domain/address/index.js";
import { resolvePrimaryType } from "../../../domain/typed-data/index.js";

// TRON reads getAddress(); EVM reads address.
export interface X402Wallet {
  readonly address: string;
  getAddress(): string;
  signTypedData(payload: TypedDataPayload): Promise<string>;
  signTransaction(tx: unknown): Promise<unknown>;
}

export interface X402WalletOptions {
  // The payment family's way to sign a transaction the SDK asks for.
  readonly signTransaction: (
    payer: PayerSigner,
    tx: unknown,
    options: X402WalletOptions,
  ) => Promise<unknown>;
  // Whether the payment request set a GasFree fee ceiling.
  readonly feeCapped?: boolean;
  readonly warn?: (message: string) => void;
  // Preserve signed-approval evidence even if payment later fails.
  readonly onApprovalSigned?: (approval: SignedApproval) => void;
}

const prefixedHex = (value: string): string => (value.startsWith("0x") ? value : `0x${value}`);

// The SDK expects the serialized EVM transaction, without the local hash.
function evmRawTransaction(signed: unknown): string {
  const raw = (signed as { raw?: unknown } | null)?.raw;
  if (typeof raw !== "string") {
    throw new ChainError("signed_payload_mismatch", "the EVM signature carried no raw transaction");
  }
  return raw;
}

// approve(address,uint256): two 32-byte ABI arguments.
const APPROVE_SELECTOR = "095ea7b3";
const MAX_UINT256_HEX = "f".repeat(64);

function tronAddressField(value: unknown): string | undefined {
  try {
    return typeof value === "string" ? tronHexToBase58(value) : undefined;
  } catch {
    return undefined;
  }
}

// approve(spender, MaxUint256) calldata yields the spender's 20 bytes in hex; other calldata yields undefined.
function unlimitedApproveSpenderHex(data: unknown): string | undefined {
  if (typeof data !== "string") return undefined;
  const hex = data.replace(/^0x/, "").toLowerCase();
  return new RegExp(`^${APPROVE_SELECTOR}0{24}([0-9a-f]{40})${MAX_UINT256_HEX}$`).exec(hex)?.[1];
}

function unlimitedApproveSpender(data: unknown): string | undefined {
  const spender = unlimitedApproveSpenderHex(data);
  return spender === undefined ? undefined : tronAddressField(tronHexFromHash20(spender));
}

const evmAddress = new EvmAddress();

function evmAddressField(value: unknown): string | undefined {
  return typeof value === "string" && evmAddress.validate(value)
    ? evmAddress.canonical(value)
    : undefined;
}

function quantityText(value: unknown): string | undefined {
  if (value === undefined || value === null) return "0";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  if (typeof value === "string" && /^(?:[0-9]+|0x[0-9a-f]+)$/i.test(value)) {
    return BigInt(value).toString();
  }
  return undefined;
}

export function decodeEvmApprove(tx: EvmUnsignedTx): DecodedEvmApprove {
  const token = evmAddressField(tx.to);
  const spender = unlimitedApproveSpenderHex(tx.data);
  const unlimitedApproveSpender =
    spender === undefined ? undefined : evmAddressField(`0x${spender}`);
  return {
    ...(token === undefined ? {} : { token }),
    valueWei: quantityText(tx.value) ?? "malformed",
    ...(unlimitedApproveSpender === undefined ? {} : { unlimitedApproveSpender }),
  };
}

export function decodeTronApprove(tx: unknown): DecodedTronApprove {
  const raw = (tx as { raw_data?: { contract?: unknown; fee_limit?: unknown } } | null)?.raw_data;
  const contracts = Array.isArray(raw?.contract) ? raw.contract : [];
  const feeLimit = raw?.fee_limit;
  const contract = contracts[0] as
    { type?: unknown; parameter?: { value?: Record<string, unknown> } } | undefined;
  const value = contract?.parameter?.value ?? {};
  const spender = unlimitedApproveSpender(value.data);
  const owner = tronAddressField(value.owner_address);
  const token = tronAddressField(value.contract_address);
  return {
    contractCount: contracts.length,
    ...(typeof contract?.type === "string" ? { contractType: contract.type } : {}),
    ...(owner === undefined ? {} : { owner }),
    ...(token === undefined ? {} : { token }),
    callValueSun: value.call_value === undefined ? "0" : String(value.call_value),
    ...(spender === undefined ? {} : { unlimitedApproveSpender: spender }),
    ...(Number.isSafeInteger(feeLimit) ? { feeLimitSun: feeLimit as number } : {}),
  };
}

function warnUncappedFee(payload: TypedDataPayload, options: X402WalletOptions): void {
  if (options.feeCapped || resolvePrimaryType(payload) !== "PermitTransfer") return;
  const fee = String(payload.message.maxFee);
  const value = String(payload.message.value);
  if (/^\d+$/.test(fee) && /^\d+$/.test(value) && BigInt(value) > 0n) {
    const percent = (BigInt(fee) * 10000n) / BigInt(value);
    options.warn?.(
      `GasFree maximum authorized fee ${fee} for payment ${value} (${percent / 100n}.${String(percent % 100n).padStart(2, "0")}% in base units). This is a ceiling, not the actual charge. Set --max-gasfree-fee or --max-gasfree-fee-raw to limit it.`,
    );
  }
}

export function toX402Wallet(payer: PayerSigner, options: X402WalletOptions): X402Wallet {
  return {
    address: payer.address,
    getAddress: () => payer.address,
    async signTypedData(payload) {
      warnUncappedFee(payload, options);
      return prefixedHex((await payer.signTypedData(payload)).signature);
    },
    signTransaction: (tx) => options.signTransaction(payer, tx, options),
  };
}

// EVM: the SDK's transaction is the payment's own approve, signed under the payer policy.
export async function signEvmPaymentTransaction(payer: PayerSigner, tx: unknown): Promise<string> {
  const input = evmTransactionInput(tx);
  return evmRawTransaction(await payer.signTransaction(input, decodeEvmApprove(input)));
}

// TRON: the SDK's transaction is a Permit2 approval; the signer checks it against raw_data_hex.
export async function signTronPermit2Approval(
  payer: PayerSigner,
  tx: unknown,
  options: Pick<X402WalletOptions, "onApprovalSigned">,
): Promise<unknown> {
  const transaction = tx as TronTransactionArtifact;
  const { signed, approval } = await payer.signPermit2Approval(
    transaction,
    decodeTronApprove(transaction),
  );
  // The signer verifies txID against raw_data_hex.
  const txId = (signed as { txID?: unknown })?.txID ?? (tx as { txID?: unknown })?.txID;
  if (typeof txId === "string") options.onApprovalSigned?.({ ...approval, txId });
  return signed;
}

// x402 uses viem's gas; wallet signers use ethers' gasLimit.
function evmTransactionInput(tx: unknown): EvmUnsignedTx {
  if (!tx || typeof tx !== "object" || Array.isArray(tx)) {
    throw new ChainError("signed_payload_mismatch", "EVM transaction must be an object");
  }
  const { gas, ...transaction } = tx as Record<string, unknown>;
  if (gas !== undefined && transaction.gasLimit == null) transaction.gasLimit = gas;
  // ethers checks the field types when the signer encodes the transaction.
  return transaction as EvmUnsignedTx;
}
