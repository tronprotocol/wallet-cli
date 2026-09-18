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
  readonly warn?: (message: string) => void;
  /** GasFree `PermitTransfer.maxFee` ceiling in base units; absent means no ceiling. */
  readonly maxGasfreeFeeRaw?: string;
  /**
   * The same ceiling in human units. It is converted at signing time with the precision of the
   * token the payload actually names (`gasfreeFeeDecimals`), never with a candidate chosen
   * earlier — the SDK may settle on a different asset than the CLI first matched.
   */
  readonly maxGasfreeFee?: string;
  /** Precision of a GasFree token by its family-native address; undefined when unknown. */
  readonly gasfreeFeeDecimals?: (token: string) => number | undefined;
  /** Wall clock in unix seconds, for the authorization deadline check; defaults to Date.now. */
  readonly now?: () => number;
  /**
   * The only TRON transaction an x402 flow may sign: `approve(spender, MaxUint256)` on one of
   * `tokens`, from the payer. The SDK has a remote RPC build that transaction, so the bridge
   * compares what came back with this intent before signing; absent, no TRON transaction is signed.
   */
  readonly approveIntent?: { readonly spender: string; readonly tokens: readonly string[] };
  /** Called once the approve has been signed: the evidence a later failure must not lose. */
  readonly onApprovalSigned?: (approval: SignedApproval) => void;
}

/** What the wallet signed for a TRON Permit2 approve — enough to find and reason about it later. */
export interface SignedApproval {
  readonly txId: string;
  readonly token: string;
  readonly spender: string;
  readonly allowance: "unlimited";
  readonly feeLimitSun: number;
}
