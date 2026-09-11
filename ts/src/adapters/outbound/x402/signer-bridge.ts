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
import type { PayerPolicy, PayerSigner } from "../../../application/contracts/x402-payer.js";
import type { TypedDataPayload, TypedDataSignature } from "../../../domain/types/index.js";
import type { ChainFamily } from "../../../domain/family/chain-family.js";
import { ChainError } from "../../../domain/errors/index.js";
import { tronHexToBase58 } from "../../../domain/address/index.js";
import { resolvePrimaryType } from "../../../domain/typed-data/index.js";

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
  maxGasfreeFeeRaw?: string,
): void {
  if (maxGasfreeFeeRaw === undefined || primaryType !== PERMIT_TRANSFER) return;
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
      assertFeeWithinCap(payload, primaryType, policy.maxGasfreeFeeRaw);
      const signed = await payer.signTypedData(payload);
      assertSignedTheRequest(signed, primaryType);
      return prefixedHex(signed.signature);
    },
    async signTransaction(tx) {
      const signed = await payer.signTransaction(
        policy.family === "evm" ? evmTransactionInput(tx) : tx,
      );
      return policy.family === "evm" ? evmRawTransaction(signed) : signed;
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
