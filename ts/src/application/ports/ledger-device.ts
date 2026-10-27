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
    options?: { display?: boolean; onWait?: () => void },
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
  appConfig(family: ChainFamily): Promise<LedgerAppState>;
}
