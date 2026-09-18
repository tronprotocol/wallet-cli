/**
 * signer-bridge — a wallet-cli PayerSigner in the shape the x402 schemes call.
 *
 * The shape is described STRUCTURALLY rather than imported: this file must compile before any
 * x402 package is a dependency, and the SDK only ever duck-types the wallet it is handed. The two
 * schemes duck-type it differently: TRON's (`createClientTronSigner`) calls `getAddress()`, EVM's
 * (`toClientEvmSigner`) reads a viem-account-shaped `address` property. `X402Wallet` carries both
 * spellings of the same value so this bridge need not be reopened once a scheme is actually wired.
 *
 * This is also the only place every typed-data payload passes through, which is why all three
 * guards live here rather than at the call sites. Two of them refuse BEFORE the signature is
 * requested, so a rejected payment never reaches a device prompt.
 */
import type {
  PayerPolicy,
  PayerSigner,
  SignedApproval,
} from "../../../application/contracts/x402-payer.js";
import type { TypedDataPayload, TypedDataSignature } from "../../../domain/types/index.js";
import type { ChainFamily } from "../../../domain/family/chain-family.js";
import { ChainError } from "../../../domain/errors/index.js";
import { tronHexToBase58, tronHexAddress } from "../../../domain/address/index.js";
import { resolvePrimaryType } from "../../../domain/typed-data/index.js";
import { toBaseUnits } from "../../../domain/amounts/index.js";

/**
 * The wallet an x402 scheme calls. Structural on purpose — see the module comment. TRON's scheme
 * reads `getAddress()`; EVM's reads `address`. Both are the same payer address.
 */
export interface X402Wallet {
  readonly address: string;
  getAddress(): string;
  signTypedData(payload: TypedDataPayload): Promise<string>;
  signTransaction(tx: unknown): Promise<unknown>;
}

/** TIP-712 GasFree authorization; the only struct whose fee this bridge caps. */
const PERMIT_TRANSFER = "PermitTransfer";

/**
 * Which field names the payer.
 *
 * `from` is the payer in the EVM exact/permit2 structs; the GasFree `PermitTransfer` calls the
 * same party `user`. A struct that names neither (a nonce read, say) has no payer to check.
 */
function declaredPayer(payload: TypedDataPayload, primaryType: string): unknown {
  return primaryType === PERMIT_TRANSFER ? payload.message.user : payload.message.from;
}

/** The TRON SDK uses 20-byte 0x addresses inside typed data, without the chain prefix. */
function canonicalTronPayer(address: string): string {
  const full = /^0x[0-9a-f]{40}$/i.test(address) ? `41${address.slice(2)}` : address;
  return tronHexToBase58(full);
}

/** Compare each chain's equivalent address representations. */
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

/**
 * A GasFree authorization signs a maxFee the service is then entitled to take, so a caller that
 * set a ceiling must have it enforced against the FINAL payload, after the SDK has filled the
 * value in. Both the payload's fee and the policy's own ceiling are parsed inside this guarded
 * path: a ceiling that will not parse must never be treated as "no ceiling".
 */
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

/**
 * The ceiling in base units of the token the payload names. A raw ceiling is used as given; a
 * human one is converted with that token's precision, and an unknown token refuses rather than
 * guesses — a ceiling that cannot be applied must never be treated as "no ceiling".
 */
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
    return toBaseUnits(policy.maxGasfreeFee, decimals, "token", "--max-gasfree-fee");
  } catch {
    throw new ChainError(
      "fee_cap_exceeded",
      `GasFree fee ceiling ${policy.maxGasfreeFee} is not a valid amount for token ${token}`,
    );
  }
}

/**
 * Which field bounds the authorization's validity, in unix seconds. Permit2 and GasFree call it
 * `deadline`; EIP-3009 calls it `validBefore`. Structs without one carry no deadline to check.
 */
function declaredDeadline(payload: TypedDataPayload, primaryType: string): unknown {
  return primaryType === "TransferWithAuthorization"
    ? payload.message.validBefore
    : payload.message.deadline;
}

/**
 * The SDK fixes the deadline before it waits for an allowance to confirm, so the window can be
 * gone by the time it asks for the signature, and again by the time a device returns one. Called
 * before signing (nothing reaches the device) and after (nothing expired is handed on to be sent).
 */
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

/** A signature is only evidence about the struct it was produced for. */
function assertSignedTheRequest(signed: TypedDataSignature, primaryType: string): void {
  if (signed.primaryType !== primaryType) {
    throw new ChainError(
      "signed_payload_mismatch",
      `signed ${signed.primaryType} but ${primaryType} was requested`,
    );
  }
}

const prefixedHex = (value: string): string => (value.startsWith("0x") ? value : `0x${value}`);

/**
 * `evmSignStrategy.sign` returns `{ raw, hash }` — the serialisation plus the locally derived id.
 * x402 wants only the serialisation it will broadcast. TRON's strategy returns the signed
 * transaction object the SDK already expects, so it passes through as it is.
 */
function evmRawTransaction(signed: unknown): string {
  const raw = (signed as { raw?: unknown } | null)?.raw;
  if (typeof raw !== "string") {
    throw new ChainError("signed_payload_mismatch", "the EVM signature carried no raw transaction");
  }
  return raw;
}

/** `approve(address,uint256)`; the spender is left-padded to 32 bytes, the amount is 32 bytes. */
const APPROVE_SELECTOR = "095ea7b3";
const MAX_UINT256_HEX = "f".repeat(64);
/** The SDK's own fee limit for the approve (100 TRX); anything above it was not built for us. */
const APPROVE_FEE_LIMIT_SUN = 100_000_000;

function tronAddressField(value: unknown): string | undefined {
  try {
    return typeof value === "string" ? tronHexToBase58(value) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The generic integrity check proves the JSON and the bytes describe the same transaction; this
 * proves that transaction is the approve the SDK asked a remote RPC to build. Everything is read
 * from `raw_data`, which the integrity check binds to `raw_data_hex` before signing.
 */
function assertApproveIntent(
  tx: unknown,
  payer: string,
  policy: PayerPolicy,
): Omit<SignedApproval, "txId"> {
  const refuse = (why: string): never => {
    throw new ChainError(
      "signed_payload_mismatch",
      `x402 TRON transaction is not the requested Permit2 approve: ${why}; refusing to sign`,
    );
  };
  const intent = policy.approveIntent;
  if (!intent) return refuse("no approve was requested");
  const raw = (tx as { raw_data?: { contract?: unknown; fee_limit?: unknown } } | null)?.raw_data;
  const contracts = Array.isArray(raw?.contract) ? raw.contract : [];
  if (contracts.length !== 1) return refuse(`expected one contract, got ${contracts.length}`);
  const contract = contracts[0] as {
    type?: unknown;
    parameter?: { value?: Record<string, unknown> };
  };
  if (contract?.type !== "TriggerSmartContract")
    return refuse(`contract type ${String(contract?.type)}`);
  const value = contract.parameter?.value ?? {};
  if (tronAddressField(value.owner_address) !== payer) return refuse("owner is not the payer");
  const token = tronAddressField(value.contract_address);
  if (token === undefined || !intent.tokens.includes(token))
    return refuse("unknown token contract");
  if (value.call_value !== undefined && Number(value.call_value) !== 0)
    return refuse("call_value is not 0");
  const data = typeof value.data === "string" ? value.data.replace(/^0x/, "").toLowerCase() : "";
  const expected = `${APPROVE_SELECTOR}${"0".repeat(24)}${tronHexAddress(intent.spender).slice(2).toLowerCase()}${MAX_UINT256_HEX}`;
  if (data !== expected) return refuse("calldata is not approve(Permit2, MaxUint256)");
  const feeLimit = raw?.fee_limit;
  if (typeof feeLimit !== "number" || !(feeLimit > 0 && feeLimit <= APPROVE_FEE_LIMIT_SUN))
    return refuse(`fee_limit ${String(feeLimit)} is outside the approve budget`);
  return { token, spender: intent.spender, allowance: "unlimited", feeLimitSun: feeLimit };
}

export function toX402Wallet(payer: PayerSigner, policy: PayerPolicy): X402Wallet {
  return {
    address: payer.address,
    getAddress: () => payer.address,
    async signTypedData(payload) {
      // Resolve the effective root ONCE and feed every guard from it, rather than branching each
      // guard on `payload.primaryType` directly — a payload that legitimately omits the field (see
      // domain/typed-data) must still be checked, not silently waved through.
      const primaryType = resolvePrimaryType(payload);
      if (primaryType === undefined) {
        throw new ChainError(
          "signed_payload_mismatch",
          "typed data has no primaryType and its root type cannot be resolved unambiguously",
        );
      }
      assertPayerMatches(payload, primaryType, payer.address, policy.family);
      assertFeeWithinCap(payload, primaryType, policy);
      if (
        primaryType === PERMIT_TRANSFER &&
        policy.maxGasfreeFeeRaw === undefined &&
        policy.maxGasfreeFee === undefined
      ) {
        const fee = String(payload.message.maxFee);
        const value = String(payload.message.value);
        if (/^\d+$/.test(fee) && /^\d+$/.test(value) && BigInt(value) > 0n) {
          const percent = (BigInt(fee) * 10000n) / BigInt(value);
          policy.warn?.(
            `GasFree maximum authorized fee ${fee} for payment ${value} (${percent / 100n}.${String(percent % 100n).padStart(2, "0")}% in base units). This is a ceiling, not the actual charge. Set --max-gasfree-fee or --max-gasfree-fee-raw to limit it.`,
          );
        }
      }
      const now = policy.now ?? (() => Math.floor(Date.now() / 1000));
      assertNotExpired(payload, primaryType, now());
      const signed = await payer.signTypedData(payload);
      assertSignedTheRequest(signed, primaryType);
      assertNotExpired(payload, primaryType, now());
      return prefixedHex(signed.signature);
    },
    async signTransaction(tx) {
      if (policy.family === "evm") {
        return evmRawTransaction(await payer.signTransaction(evmTransactionInput(tx)));
      }
      const approval = assertApproveIntent(tx, payer.address, policy);
      const signed = await payer.signTransaction(tx);
      // The signer has verified txID against raw_data_hex before signing; it is the id to look up.
      const txId = (signed as { txID?: unknown })?.txID ?? (tx as { txID?: unknown })?.txID;
      if (typeof txId === "string") policy.onApprovalSigned?.({ ...approval, txId });
      return signed;
    },
  };
}

/** x402 uses viem's `gas`; wallet signers use ethers' `gasLimit`. */
function evmTransactionInput(tx: unknown): Record<string, unknown> {
  if (!tx || typeof tx !== "object" || Array.isArray(tx)) {
    throw new ChainError("signed_payload_mismatch", "EVM transaction must be an object");
  }
  const { gas, ...transaction } = tx as Record<string, unknown>;
  if (gas !== undefined && transaction.gasLimit == null) transaction.gasLimit = gas;
  return transaction;
}
