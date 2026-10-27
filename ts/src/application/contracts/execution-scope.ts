import type { AccountRef, ChainFamily, WarningView } from "../../domain/types/index.js";
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
  // Nonfatal warning for JSON meta.warnings or text-mode stderr.
  warn(message: string | WarningView): void;
}
