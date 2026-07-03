import type { ChainFamily, SignedTx, UnsignedTx } from "../../domain/types/index.js";

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
  signMessage(family: ChainFamily, path: string, message: string): Promise<string>;
  appConfig(family: ChainFamily): Promise<LedgerAppState>;
}

