import type {
  DecodedTronApprove,
  PayerSigner,
  SignedApproval,
} from "../../../application/contracts/x402-payer.js";
import type { TypedDataPayload } from "../../../domain/types/index.js";
import type { ChainFamily } from "../../../domain/family/chain-family.js";
import { ChainError } from "../../../domain/errors/index.js";
import { tronHexToBase58 } from "../../../domain/address/index.js";
import { resolvePrimaryType } from "../../../domain/typed-data/index.js";

// TRON reads getAddress(); EVM reads address.
export interface X402Wallet {
  readonly address: string;
  getAddress(): string;
  signTypedData(payload: TypedDataPayload): Promise<string>;
  signTransaction(tx: unknown): Promise<unknown>;
}

export interface X402WalletOptions {
  readonly family: ChainFamily;
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

// approve(spender, MaxUint256) calldata yields the spender; any other calldata yields undefined.
function unlimitedApproveSpender(data: unknown): string | undefined {
  if (typeof data !== "string") return undefined;
  const hex = data.replace(/^0x/, "").toLowerCase();
  const match = new RegExp(`^${APPROVE_SELECTOR}0{24}([0-9a-f]{40})${MAX_UINT256_HEX}$`).exec(hex);
  return match ? tronAddressField(`41${match[1]}`) : undefined;
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
    ...(typeof feeLimit === "number" ? { feeLimitSun: feeLimit } : {}),
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
    async signTransaction(tx) {
      if (options.family === "evm") {
        return evmRawTransaction(await payer.signTransaction(evmTransactionInput(tx)));
      }
      const { signed, approval } = await payer.signPermit2Approval(tx, decodeTronApprove(tx));
      // The signer verifies txID against raw_data_hex.
      const txId = (signed as { txID?: unknown })?.txID ?? (tx as { txID?: unknown })?.txID;
      if (typeof txId === "string") options.onApprovalSigned?.({ ...approval, txId });
      return signed;
    },
  };
}

// x402 uses viem's gas; wallet signers use ethers' gasLimit.
function evmTransactionInput(tx: unknown): Record<string, unknown> {
  if (!tx || typeof tx !== "object" || Array.isArray(tx)) {
    throw new ChainError("signed_payload_mismatch", "EVM transaction must be an object");
  }
  const { gas, ...transaction } = tx as Record<string, unknown>;
  if (gas !== undefined && transaction.gasLimit == null) transaction.gasLimit = gas;
  return transaction;
}
