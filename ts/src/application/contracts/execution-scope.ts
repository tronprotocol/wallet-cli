import type { AccountRef, ChainFamily } from "../../domain/types/index.js";
import type { ProgressEvent } from "./progress.js";

export interface AccountScope {
  readonly activeAccount: AccountRef;
  resolveAddress(family: ChainFamily): string;
}

export interface TransactionScope extends AccountScope {
  readonly timeoutMs: number;
  readonly wait: boolean;
  readonly waitTimeoutMs: number;
  emit(event: ProgressEvent): void;
}
