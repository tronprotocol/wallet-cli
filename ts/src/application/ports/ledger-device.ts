import type { ChainFamily, SignedTx, TypedDataPayload, TypedDataSignature, UnsignedTx } from "../../domain/types/index.js";

export interface LedgerAppState {
  version: string;
  ready: boolean;
}

/** Device capability required by application signing; transport details stay outbound. */
export interface LedgerDevice {
  getAddress(
    family: ChainFamily,
    path: string,
    options?: { display?: boolean; onWait?: () => void },
  ): Promise<string>;
  signTransaction(
    family: ChainFamily,
    path: string,
    transaction: UnsignedTx,
    signal?: AbortSignal,
  ): Promise<SignedTx>;
  signMessage(family: ChainFamily, path: string, message: string, signal?: AbortSignal): Promise<string>;
  /** structured-data signing. Takes the whole payload, not pre-computed hashes: the TRON app can
   *  only sign the hashed form, but the Ethereum app also offers full clear-signing — a
   *  hash-shaped port would lock a future EVM adapter out of it. */
  signTypedData(family: ChainFamily, path: string, payload: TypedDataPayload, signal?: AbortSignal): Promise<TypedDataSignature>;
  appConfig(family: ChainFamily): Promise<LedgerAppState>;
}

