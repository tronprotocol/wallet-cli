import type {
  ChainFamily,
  SignedTx,
  TypedDataPayload,
  TypedDataSignature,
  UnsignedTx,
} from "../../domain/types/index.js";

export interface LedgerAppState {
  version: string;
  ready: boolean;
}

export interface LedgerDevice {
  getAddress(
    family: ChainFamily,
    path: string,
    // `signal` closes the device connection; the operation then fails with the signal's reason.
    options: { display?: boolean; onWait?: () => void; signal: AbortSignal },
  ): Promise<string>;
  signTransaction(
    family: ChainFamily,
    path: string,
    transaction: UnsignedTx,
    signal?: AbortSignal,
    options?: { onWarning?: (message: string) => void },
  ): Promise<SignedTx>;
  signMessage(
    family: ChainFamily,
    path: string,
    message: string,
    signal?: AbortSignal,
  ): Promise<string>;
  // Pass the whole payload so devices can offer clear-signing instead of only hash signing.
  signTypedData(
    family: ChainFamily,
    path: string,
    payload: TypedDataPayload,
    signal?: AbortSignal,
  ): Promise<TypedDataSignature>;
  appConfig(family: ChainFamily, signal: AbortSignal): Promise<LedgerAppState>;
}
