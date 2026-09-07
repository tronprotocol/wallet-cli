/**
 * PayerSigner — the signing capability an x402 payment flow consumes.
 *
 * Deliberately NOT the domain `Signer`. An x402 scheme calls the wallet from deep inside a
 * payment flow, where nothing can run a device's precheck / prompt / abort ceremony. So the
 * ceremony is applied at construction (`createPayerSigner`) and what crosses this port is two
 * closures that have already been through it. The outbound adapter therefore never learns that
 * Ledger accounts exist.
 */
import type { ChainFamily } from "../../domain/family/chain-family.js";
import type { TypedDataPayload, TypedDataSignature } from "../../domain/types/index.js";

export interface PayerSigner {
  /** family-native spelling: base58 `T...` for tron, `0x...` for evm. */
  readonly address: string;
  signTypedData(payload: TypedDataPayload): Promise<TypedDataSignature>;
  signTransaction(tx: unknown): Promise<unknown>;
}

/** Per-payment limits the bridge enforces on every payload it passes on. */
export interface PayerPolicy {
  readonly family: ChainFamily;
  /** GasFree `PermitTransfer.maxFee` ceiling in base units; absent means no ceiling. */
  readonly maxGasfreeFeeRaw?: string;
}
