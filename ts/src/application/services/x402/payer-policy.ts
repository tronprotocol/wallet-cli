import type {
  DecodedTronApprove,
  PayerSigner,
  SignedApproval,
} from "../../contracts/x402-payer.js";
import type { TypedDataPayload, TypedDataSignature } from "../../../domain/types/index.js";
import type { ChainFamily } from "../../../domain/family/chain-family.js";
import { ChainError } from "../../../domain/errors/index.js";
import { tronHexToBase58 } from "../../../domain/address/index.js";
import { resolvePrimaryType } from "../../../domain/typed-data/index.js";
import { toBaseUnits } from "../../../domain/amounts/index.js";

// Budget for one Permit2 approve: 100 TRX in SUN.
export const X402_APPROVE_FEE_LIMIT_SUN = 100_000_000;

export interface PayerPolicy {
  readonly family: ChainFamily;
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
}

// The payer's signing capability before the payment policy is applied.
export type UnguardedPayer = Pick<PayerSigner, "address" | "signTypedData" | "signTransaction">;

const PERMIT_TRANSFER = "PermitTransfer";

function declaredPayer(payload: TypedDataPayload, primaryType: string): unknown {
  return primaryType === PERMIT_TRANSFER ? payload.message.user : payload.message.from;
}

// TRON typed data uses 20-byte 0x addresses without the chain prefix.
function canonicalTronPayer(address: string): string {
  const full = /^0x[0-9a-f]{40}$/i.test(address) ? `41${address.slice(2)}` : address;
  return tronHexToBase58(full);
}

function samePayer(family: ChainFamily, a: string, b: string): boolean {
  return family === "tron"
    ? canonicalTronPayer(a) === canonicalTronPayer(b)
    : a.toLowerCase() === b.toLowerCase();
}

function assertPayerMatches(
  payload: TypedDataPayload,
  primaryType: string,
  address: string,
  family: ChainFamily,
): void {
  const declared = declaredPayer(payload, primaryType);
  if (declared === undefined) return;
  if (typeof declared !== "string" || !samePayer(family, declared, address)) {
    throw new ChainError(
      "payer_mismatch",
      `this payment names a different payer than the selected account ${address}`,
      { account: address, payload: String(declared) },
    );
  }
}

// Enforce the cap on the final SDK payload; invalid caps must fail closed.
function assertFeeWithinCap(
  payload: TypedDataPayload,
  primaryType: string,
  policy: PayerPolicy,
): void {
  if (primaryType !== PERMIT_TRANSFER) return;
  const maxGasfreeFeeRaw = feeCapRaw(payload, policy);
  if (maxGasfreeFeeRaw === undefined) return;
  const declared = payload.message.maxFee;
  let fee: bigint;
  let cap: bigint;
  try {
    fee = BigInt(declared as string | number | bigint);
    cap = BigInt(maxGasfreeFeeRaw);
  } catch {
    throw new ChainError(
      "fee_cap_exceeded",
      `GasFree maxFee ${String(declared)} or cap ${maxGasfreeFeeRaw} is not a whole number`,
    );
  }
  if (fee < 0n || fee > cap) {
    throw new ChainError(
      "fee_cap_exceeded",
      `GasFree maxFee ${fee} exceeds the ${maxGasfreeFeeRaw} ceiling`,
      { fee: fee.toString(), cap: maxGasfreeFeeRaw },
    );
  }
}

// Use the signed token's precision; unknown precision must fail closed.
function feeCapRaw(payload: TypedDataPayload, policy: PayerPolicy): string | undefined {
  if (policy.maxGasfreeFeeRaw !== undefined) return policy.maxGasfreeFeeRaw;
  if (policy.maxGasfreeFee === undefined) return undefined;
  const token = payload.message.token;
  const decimals =
    typeof token === "string" ? policy.gasfreeFeeDecimals?.(canonicalTronPayer(token)) : undefined;
  if (decimals === undefined) {
    throw new ChainError(
      "fee_cap_exceeded",
      `cannot apply the GasFree fee ceiling: unknown precision for token ${String(token)}`,
    );
  }
  try {
    return toBaseUnits(policy.maxGasfreeFee, decimals, "token", "GasFree fee ceiling");
  } catch {
    throw new ChainError(
      "fee_cap_exceeded",
      `GasFree fee ceiling ${policy.maxGasfreeFee} is not a valid amount for token ${token}`,
    );
  }
}

// Authorization deadlines are Unix seconds.
function declaredDeadline(payload: TypedDataPayload, primaryType: string): unknown {
  return primaryType === "TransferWithAuthorization"
    ? payload.message.validBefore
    : payload.message.deadline;
}

// Allowance confirmation and device signing can each outlast the authorization deadline.
function assertNotExpired(payload: TypedDataPayload, primaryType: string, now: number): void {
  const declared = declaredDeadline(payload, primaryType);
  if (declared === undefined) return;
  let deadline: bigint;
  try {
    deadline = BigInt(declared as string | number | bigint);
  } catch {
    throw new ChainError(
      "tx_expired",
      `payment authorization deadline ${String(declared)} is not a whole number`,
    );
  }
  if (deadline <= BigInt(now)) {
    throw new ChainError(
      "tx_expired",
      "the payment authorization's deadline has passed; it was not signed or sent",
      { deadline: deadline.toString(), now: String(now) },
    );
  }
}

function assertSignedTheRequest(signed: TypedDataSignature, primaryType: string): void {
  if (signed.primaryType !== primaryType) {
    throw new ChainError(
      "signed_payload_mismatch",
      `signed ${signed.primaryType} but ${primaryType} was requested`,
    );
  }
}

function refuseApprove(why: string): never {
  throw new ChainError(
    "signed_payload_mismatch",
    `x402 TRON transaction is not the requested Permit2 approve: ${why}; refusing to sign`,
  );
}

// The signer separately binds raw_data to raw_data_hex.
function assertApproveIntent(
  decoded: DecodedTronApprove,
  payer: string,
  policy: PayerPolicy,
): Omit<SignedApproval, "txId"> {
  const intent = policy.approveIntent;
  if (!intent) return refuseApprove("no approve was requested");
  if (decoded.contractCount !== 1)
    return refuseApprove(`expected one contract, got ${decoded.contractCount}`);
  if (decoded.contractType !== "TriggerSmartContract")
    return refuseApprove(`contract type ${String(decoded.contractType)}`);
  if (decoded.owner !== payer) return refuseApprove("owner is not the payer");
  const token = decoded.token;
  if (token === undefined || !intent.tokens.includes(token))
    return refuseApprove("unknown token contract");
  if (Number(decoded.callValueSun) !== 0) return refuseApprove("call_value is not 0");
  if (decoded.unlimitedApproveSpender !== intent.spender)
    return refuseApprove("calldata is not approve(Permit2, MaxUint256)");
  const feeLimit = decoded.feeLimitSun;
  if (typeof feeLimit !== "number" || !(feeLimit > 0 && feeLimit <= X402_APPROVE_FEE_LIMIT_SUN))
    return refuseApprove(`fee_limit ${String(feeLimit)} is outside the approve budget`);
  return { token, spender: intent.spender, allowance: "unlimited", feeLimitSun: feeLimit };
}

export function withPayerPolicy(payer: UnguardedPayer, policy: PayerPolicy): PayerSigner {
  return {
    address: payer.address,
    async signTypedData(payload) {
      // Infer omitted primaryType before applying every guard.
      const primaryType = resolvePrimaryType(payload);
      if (primaryType === undefined) {
        throw new ChainError(
          "signed_payload_mismatch",
          "typed data has no primaryType and its root type cannot be resolved unambiguously",
        );
      }
      assertPayerMatches(payload, primaryType, payer.address, policy.family);
      assertFeeWithinCap(payload, primaryType, policy);
      const now = policy.now ?? (() => Math.floor(Date.now() / 1000));
      assertNotExpired(payload, primaryType, now());
      const signed = await payer.signTypedData(payload);
      assertSignedTheRequest(signed, primaryType);
      assertNotExpired(payload, primaryType, now());
      return signed;
    },
    async signTransaction(tx) {
      if (policy.family !== "evm") return refuseApprove("it was not decoded as an approve");
      return payer.signTransaction(tx);
    },
    async signPermit2Approval(tx, decoded) {
      if (policy.family !== "tron") return refuseApprove("the payment network is not TRON");
      const approval = assertApproveIntent(decoded, payer.address, policy);
      return { signed: await payer.signTransaction(tx), approval };
    },
  };
}
