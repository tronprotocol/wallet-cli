/**
 * ExecutionContext (L2) — assemble runtime context from config/env/flags. Selection is
 * account-level: activeAccount is resolved lazily from --account/--wallet or wallets.json
 * (修正⑥). Build is side-effect-free; secrets never enter the serializable surface. (plan §3 L2)
 */
import type {
  AccountRef,
  ChainFamily,
  Config,
  ExecutionContext,
  Globals,
  NetworkRegistry,
  OutputMode,
  ProgressEvent,
  SecretResolver,
  StreamManager,
} from "../types/index.js";
import type { OutputFormatter } from "../output/index.js";
import { Keystore, accountRef, walletAddress } from "../keystore/index.js";
import { WalletError } from "../errors/index.js";

export interface RuntimeDeps {
  config: Config;
  networkRegistry: NetworkRegistry;
  streams: StreamManager;
  secrets: SecretResolver;
  keystore: Keystore;
  formatter: OutputFormatter;
}

class ExecutionContextImpl implements ExecutionContext {
  output: OutputMode;
  timeoutMs: number;
  noDeviceWait: boolean;
  #activeRef?: AccountRef;

  constructor(
    private readonly globals: Globals,
    private readonly deps: RuntimeDeps,
  ) {
    this.output = globals.output;
    this.timeoutMs = globals.timeoutMs ?? deps.config.timeoutMs;
    this.noDeviceWait = globals.noDeviceWait;
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

  get activeAccount(): AccountRef {
    if (this.#activeRef) return this.#activeRef;
    const ks = this.deps.keystore;
    let ref: AccountRef | null;
    if (this.globals.account) {
      const { wallet, index } = ks.resolveAccount(this.globals.account);
      ref = accountRef(wallet.id, wallet.source.type === "seed" ? index : null);
    } else {
      ref = ks.activeAccount();
    }
    if (!ref) {
      throw new WalletError("missing_wallet_address", "no active account; import one or pass --account");
    }
    this.#activeRef = ref;
    return ref;
  }

  resolveAddress(family: ChainFamily): string {
    const { wallet, index } = this.deps.keystore.resolveAccount(this.activeAccount);
    const address = walletAddress(wallet, family, index);
    if (!address) throw new WalletError("missing_wallet_address", `active account has no ${family} address`);
    return address;
  }

  emit(e: ProgressEvent): void {
    this.deps.streams.event(this.deps.formatter.event(e));
  }
}

export function buildExecutionContext(globals: Globals, deps: RuntimeDeps): ExecutionContext {
  return new ExecutionContextImpl(globals, deps);
}
