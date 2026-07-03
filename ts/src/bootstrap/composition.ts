import type { OutputMode } from "../domain/types/index.js";
import type { ChainModule, Globals, SessionRef } from "../adapters/inbound/cli/contracts/index.js";
import { ConfigLoader, NetworkRegistry } from "../adapters/outbound/config/index.js";
import { YamlConfigDocument } from "../adapters/outbound/config/yaml-config-document.js";
import {
  CAP_SUMMARIES,
  TRAIT_SUMMARIES,
} from "../adapters/outbound/config/builtins.js";
import { AtomicFileStore } from "../adapters/outbound/persistence/fs/index.js";
import { SecureBackupWriter } from "../adapters/outbound/persistence/backup-writer.js";
import { Keystore } from "../adapters/outbound/keystore/index.js";
import { Ledger } from "../adapters/outbound/ledger/index.js";
import { TokenBook } from "../adapters/outbound/tokenbook/index.js";
import { createPriceProvider } from "../adapters/outbound/price/index.js";
import { ChainGatewayRegistry } from "../adapters/outbound/chain/tron/index.js";
import { StreamManager } from "../adapters/inbound/cli/stream/index.js";
import { SecretResolver, type SecretPaths } from "../adapters/inbound/cli/input/secret/index.js";
import { createPrompter } from "../adapters/inbound/cli/input/prompt/index.js";
import { CommandRegistry } from "../adapters/inbound/cli/registry/index.js";
import { createOutputFormatter } from "../adapters/inbound/cli/output/index.js";
import { registerWalletCommands } from "../adapters/inbound/cli/commands/wallet.js";
import { registerConfigCommands } from "../adapters/inbound/cli/commands/config.js";
import { registerNetworkCommands } from "../adapters/inbound/cli/commands/network.js";
import { CapabilityRegistry } from "../application/services/capability/index.js";
import { SignerResolver } from "../application/services/signer/index.js";
import { TargetResolver } from "../application/services/target/index.js";
import { TxPipeline } from "../application/services/pipeline/index.js";
import { ConfigService } from "../application/use-cases/config-service.js";
import { WalletService } from "../application/use-cases/wallet-service.js";
import { FAMILY_REGISTRY, familyMap } from "./family-registry.js";

export interface BootstrapOptions {
  readonly globals: Globals;
  readonly secretPaths: SecretPaths;
  readonly startedAt: number;
}

/** Fully wired process-scoped dependencies. No command side effect runs during construction. */
export function composeCliRuntime(options: BootstrapOptions) {
  const config = ConfigLoader.load();
  // effective per-invocation RPC/device timeout: --timeout wins over the config default.
  const timeoutMs = options.globals.timeoutMs ?? config.timeoutMs;
  const output: OutputMode = options.globals.output ?? config.defaultOutput;
  const streams = new StreamManager(output, options.globals.verbose);
  const formatter = createOutputFormatter(output, streams, options.startedAt);

  const root = ConfigLoader.resolveRoot();
  const store = new AtomicFileStore();
  const configService = new ConfigService(
    new YamlConfigDocument(ConfigLoader.configPath(), store),
  );
  const networkRegistry = new NetworkRegistry(config);
  const prompter = createPrompter();
  const secrets = new SecretResolver(streams, options.secretPaths, prompter);
  const keystore = new Keystore(root, store, () => secrets.masterPassword());
  const ledger = new Ledger(timeoutMs);
  const walletService = new WalletService(
    keystore,
    ledger,
    new SecureBackupWriter(root),
  );
  const tokenBook = new TokenBook(root, store);
  const priceProvider = createPriceProvider(config.price, timeoutMs);
  const gatewayProvider = new ChainGatewayRegistry(
    familyMap((plugin) => plugin.createGateway),
    timeoutMs,
  );
  const capabilityRegistry = new CapabilityRegistry();
  const signerResolver = new SignerResolver(
    keystore,
    ledger,
    familyMap((definition) => definition.signStrategy),
  );
  const txPipeline = new TxPipeline(signerResolver);

  const registry = new CommandRegistry();
  registerWalletCommands(registry, { walletService, ledger });
  registerConfigCommands(registry, configService);
  registerNetworkCommands(registry);
  const chainModules: ChainModule[] = FAMILY_REGISTRY.map((definition) =>
    definition.createModule({
      gateways: gatewayProvider,
      tokens: tokenBook,
      prices: priceProvider,
      signers: signerResolver,
      transactions: txPipeline,
      timeoutMs,
    }),
  );
  for (const module of chainModules) module.registerCommands(registry);

  const capabilitiesByFamily = registry.capabilityKeysByFamily();
  for (const network of Object.values(config.networks)) {
    const commandCapabilities = (capabilitiesByFamily.get(network.family) ?? []).map((key) => ({
      key,
      summary: CAP_SUMMARIES[key] ?? key,
    }));
    const traits = network.capabilities.map((key) => ({
      key,
      summary: TRAIT_SUMMARIES[key] ?? key,
    }));
    capabilityRegistry.register(network.id, [...commandCapabilities, ...traits]);
  }

  const deps = {
    config,
    networkRegistry,
    streams,
    secrets,
    keystore,
    prompter,
    formatter,
  };
  const session: SessionRef = {};

  return {
    config,
    streams,
    formatter,
    prompter,
    registry,
    deps,
    session,
    capabilities: capabilityRegistry,
    targetResolver: new TargetResolver({ networkRegistry, keystore }),
  };
}

export type CliRuntime = ReturnType<typeof composeCliRuntime>;
