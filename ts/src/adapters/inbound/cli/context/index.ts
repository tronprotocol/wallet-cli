// Resolve accounts lazily; keep secrets out of the serializable context.
import type {
  AccountSelector,
  ChainFamily,
  Config,
  OutputMode,
  WarningView,
} from "../../../../domain/types/index.js";
import type { CodedWarning, ProgressEvent } from "../../../../application/contracts/index.js";
import type { NetworkRegistry } from "../../../../application/ports/network-registry.js";
import type {
  ExecutionContext,
  Globals,
  SecretResolver,
  StreamManager,
} from "../contracts/index.js";
import type { OutputFormatter } from "../output/index.js";
import { cliMessage } from "../output/errors.js";
import type { UserMessage } from "../../../../domain/errors/index.js";
import type { Prompter } from "../input/prompt/index.js";
import type { WalletService } from "../../../../application/use-cases/wallet-service.js";

// Stored-account reads a command session needs.
export type AccountSession = Pick<
  WalletService,
  "selectAccount" | "accountAddress" | "isInitialized" | "verifyPassword" | "list" | "describe"
>;

export interface RuntimeDeps {
  config: Config;
  networkRegistry: NetworkRegistry;
  streams: StreamManager;
  secrets: SecretResolver;
  accounts: AccountSession;
  prompter: Prompter;
  formatter: OutputFormatter;
}

class ExecutionContextImpl implements ExecutionContext {
  output: OutputMode;
  timeoutMs: number;
  wait: boolean;
  waitTimeoutMs: number;
  #selected?: AccountSelector;

  constructor(
    private readonly globals: Globals,
    private readonly deps: RuntimeDeps,
  ) {
    this.output = globals.output ?? deps.config.defaultOutput;
    this.timeoutMs = globals.timeoutMs ?? deps.config.timeoutMs;
    this.wait = globals.wait ?? false;
    this.waitTimeoutMs = globals.waitTimeoutMs ?? deps.config.waitTimeoutMs;
  }

  get config(): Config {
    return this.deps.config;
  }
  get networkRegistry(): NetworkRegistry {
    return this.deps.networkRegistry;
  }
  get streams(): StreamManager {
    return this.deps.streams;
  }
  get secrets(): SecretResolver {
    return this.deps.secrets;
  }
  get prompt(): Prompter {
    return this.deps.prompter;
  }
  get network(): string | undefined {
    return this.globals.network;
  }

  get activeAccount(): AccountSelector {
    this.#selected ??= this.deps.accounts.selectAccount(this.globals.account);
    return this.#selected;
  }

  resolveAddress(family: ChainFamily): string {
    return this.deps.accounts.accountAddress(this.activeAccount, family);
  }

  emit(e: ProgressEvent): void {
    this.deps.streams.event(this.deps.formatter.event(e));
  }

  warn(message: string | WarningView | UserMessage | CodedWarning): void {
    this.deps.streams.diagnostic("warn", cliWarning(message));
  }
}

function cliWarning(
  message: string | WarningView | UserMessage | CodedWarning,
): string | WarningView {
  if (typeof message === "string") return message;
  if (!("code" in message)) return cliMessage(message).message;
  const text = message.message;
  return { ...message, message: typeof text === "string" ? text : cliMessage(text).message };
}

export function buildExecutionContext(globals: Globals, deps: RuntimeDeps): ExecutionContext {
  return new ExecutionContextImpl(globals, deps);
}
