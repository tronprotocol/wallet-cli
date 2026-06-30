/**
 * ExecutionContext — assemble runtime context from config, environment, and flags. Selection is
 * account-level: activeAccount is resolved lazily from --account/--wallet or wallets.json.
 * Build is side-effect-free; secrets never enter the serializable surface.
 */
import type { AccountRef, ChainFamily, Config, OutputMode } from "../../../../domain/types/index.js";
import type { ProgressEvent } from "../../../../application/contracts/index.js";
import type { NetworkRegistry } from "../../../../application/ports/network-registry.js";
import type { ExecutionContext, Globals, SecretResolver, StreamManager } from "../contracts/index.js";
import type { OutputFormatter } from "../output/index.js";
import type { Prompter } from "../input/prompt/index.js";
import type { AccountStore } from "../../../../application/ports/account-store.js";
import { accountRef, walletAddress } from "../../../../domain/wallet/index.js";
import { WalletError } from "../../../../domain/errors/index.js";
import { SOURCE_KINDS } from "../../../../domain/sources/index.js";

export interface RuntimeDeps {
  config: Config;
  networkRegistry: NetworkRegistry;
  streams: StreamManager;
  secrets: SecretResolver;
  keystore: AccountStore;
  prompter: Prompter;
  formatter: OutputFormatter;
}

class ExecutionContextImpl implements ExecutionContext {
  output: OutputMode;
  timeoutMs: number;
  wait: boolean;
  waitTimeoutMs: number;
  #activeRef?: AccountRef;

  constructor(
    private readonly globals: Globals,
    private readonly deps: RuntimeDeps,
  ) {
    this.output = globals.output ?? deps.config.defaultOutput;
    this.timeoutMs = globals.timeoutMs ?? deps.config.timeoutMs;
    this.wait = globals.wait ?? false;
    this.waitTimeoutMs = globals.waitTimeoutMs ?? 60_000;
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

  get activeAccount(): AccountRef {
    if (this.#activeRef) return this.#activeRef;
    const ks = this.deps.keystore;
    let ref: AccountRef | null;
    if (this.globals.account) {
      const { wallet, index } = ks.resolveAccount(this.globals.account);
      ref = accountRef(wallet.id, SOURCE_KINDS[wallet.source.type].isHD ? index : null);
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
