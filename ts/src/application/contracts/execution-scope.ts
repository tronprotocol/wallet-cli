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
  /** surface a non-fatal warning: captured into the JSON envelope's meta.warnings and, in text
   *  mode, printed to stderr. Use when an outcome silently degrades (e.g. --wait not confirmed). */
  warn(message: string | WarningView): void;
}
