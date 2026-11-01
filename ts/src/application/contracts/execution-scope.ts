import type { AccountSelector, ChainFamily, WarningView } from "../../domain/types/index.js";
import type { UserMessage } from "../../domain/errors/index.js";
import type { ExecutionDeadline } from "./deadline.js";
import type { ProgressEvent } from "./progress.js";

// A coded warning whose message names inputs or follow-up steps.
export interface CodedWarning {
  readonly code: string;
  readonly message: UserMessage;
}

export interface AccountScope {
  readonly deadline: ExecutionDeadline;
  readonly activeAccount: AccountSelector;
  resolveAddress(family: ChainFamily): string;
}

export interface TransactionScope extends AccountScope {
  readonly wait: boolean;
  emit(event: ProgressEvent): void;
  // Nonfatal warning for JSON meta.warnings or text-mode stderr.
  warn(message: string | WarningView | UserMessage | CodedWarning): void;
}
