import { processBroadcastGuard } from "../application/services/broadcast-guard.js";
import { CommandDeadline } from "../application/services/command-deadline.js";
import { systemWallClock } from "../application/contracts/wall-clock.js";
import { ProcessLifetime } from "./process-lifetime.js";
import { MigrationService } from "../application/use-cases/migration-service.js";
import { FileDataMigrations } from "../adapters/outbound/persistence/migration.js";
import { migrationSteps } from "./migration-steps.js";
import type { OutputMode } from "../domain/types/index.js";
import type { Globals, SessionRef } from "../adapters/inbound/cli/contracts/index.js";
import { ConfigLoader, NetworkRegistry } from "../adapters/outbound/config/index.js";
import { YamlConfigDocument } from "../adapters/outbound/config/yaml-config-document.js";
import { AtomicFileStore } from "../adapters/outbound/persistence/fs/index.js";
import { SecureBackupWriter } from "../adapters/outbound/persistence/backup-writer.js";
import { FileBackupRecordStore } from "../adapters/outbound/persistence/backup-records.js";
import { Keystore } from "../adapters/outbound/keystore/index.js";
import { Ledger } from "../adapters/outbound/ledger/index.js";
import { assertTronTxIntegrity } from "../adapters/outbound/chain/tron/tx-integrity.js";
import { TokenBook } from "../adapters/outbound/tokenbook/index.js";
import { createPriceProvider } from "../adapters/outbound/price/index.js";
import { ChainGatewayRegistry } from "../adapters/outbound/chain/tron/index.js";
import { StreamManager } from "../adapters/inbound/cli/stream/index.js";
import { SecretResolver, type SecretPaths } from "../adapters/inbound/cli/input/secret/index.js";
import { createPrompter } from "../adapters/inbound/cli/input/prompt/index.js";
import { CommandRegistry } from "../adapters/inbound/cli/registry/index.js";
import { createOutputFormatter } from "../adapters/inbound/cli/output/index.js";
import { FollowUpTable } from "../adapters/inbound/cli/output/errors.js";
import { ErrorCodeTable } from "../domain/errors/codes.js";
import { registerWalletCommands } from "../adapters/inbound/cli/commands/wallet.js";
import { registerConfigCommands } from "../adapters/inbound/cli/commands/config.js";
import { registerNetworkCommands } from "../adapters/inbound/cli/commands/network.js";
import { CapabilityRegistry } from "../application/services/capability/index.js";
import { SignerResolver } from "../application/services/signer/index.js";
import { TargetResolver } from "../application/services/target/index.js";
import { TxPipeline } from "../application/services/pipeline/index.js";
import { SigningService } from "../application/services/signing/signing-service.js";
import { ConfigService, configuredCredentials } from "../application/use-cases/config-service.js";
import { WalletService } from "../application/use-cases/wallet-service.js";
import { familyMap } from "./family-registry.js";
import { registerTronChainCommands } from "./families/tron.js";
import { registerEvmChainCommands } from "./families/evm.js";
import { AccountBalanceService } from "../application/use-cases/account-balance-service.js";
import { TokenBookService } from "../application/use-cases/token-book-service.js";
import { TronLinkClient } from "../adapters/outbound/tronlink/client.js";
import { ContactBook } from "../adapters/outbound/contactbook/index.js";
import { ContactService } from "../application/use-cases/contact-service.js";
import { RecipientResolver } from "../application/services/recipient-resolver.js";
import { registerContactCommands } from "../adapters/inbound/cli/commands/contact.js";
import { EncodingService } from "../application/use-cases/encoding-service.js";
import { AddressService } from "../application/use-cases/address-service.js";
import { SecureKeypairWriter } from "../adapters/outbound/persistence/keypair-writer.js";
import { registerEncodingCommands } from "../adapters/inbound/cli/commands/encoding.js";
import { registerAddressCommands } from "../adapters/inbound/cli/commands/address.js";
import { TerminalQrEncoder } from "../adapters/outbound/qr/index.js";
import { EvmContractService } from "../application/use-cases/evm/contract-service.js";
import { TronContractService } from "../application/use-cases/tron/contract-service.js";
import { PluginSigning } from "../application/services/plugins/plugin-signing.js";
import { TronContractCalls } from "../application/services/plugins/tron-contract-calls.js";
import { hostServices, RESERVED_WORDS } from "./plugins/host.js";
import { PluginLoader } from "./plugins/loader.js";
import { FilePluginStore } from "../adapters/outbound/plugins/store.js";
import type { PluginStore, StoredPlugin } from "../application/ports/plugin-store.js";
import { mergeCredentials, type PluginCredentialManifest } from "../domain/plugins/index.js";
import { PackageSource } from "../adapters/outbound/plugins/source.js";
import { PluginService } from "../application/use-cases/plugin-service.js";
import { registerPluginCommands } from "../adapters/inbound/cli/commands/plugin.js";
import { FAMILIES } from "../domain/family/index.js";

export interface BootstrapOptions {
  readonly globals: Globals;
  readonly secretPaths: SecretPaths;
  readonly startedAt: number;
  // performance.now() when the command started; the deadline counts from here.
  readonly monotonicStart: number;
}

// One reading of the installed manifests: the credential keys and the loader both use it, so the
// version a command reports is the version it runs. A failed reading is reported by the loader.
function readManifests(store: Pick<PluginStore, "list">): Pick<PluginStore, "list"> {
  try {
    const stored = store.list();
    return { list: () => [...stored] };
  } catch (error) {
    return {
      list: () => {
        throw error;
      },
    };
  }
}

// Installed plugins by name; a key once.
function declaredCredentials(installed: Pick<PluginStore, "list">): PluginCredentialManifest[] {
  let stored: StoredPlugin[] = [];
  try {
    stored = installed.list();
  } catch {
    // The loader reports it once output is masked.
  }
  const manifests = stored
    .flatMap((item) => (item.state === "installed" ? [item.plugin] : []))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((plugin) => plugin.credentials);
  return mergeCredentials(manifests);
}

export function composeCliRuntime(options: BootstrapOptions) {
  const root = ConfigLoader.resolveRoot();
  // Read before the configuration, which needs the credential keys they declare; runs no plugin code.
  const pluginStore = new FilePluginStore(root, {
    withLock: (path, fn, opts) => store.withLock(path, fn, opts),
  });
  const manifests = readManifests(pluginStore);
  const credentials = declaredCredentials(manifests);
  const config = ConfigLoader.load(
    process.env,
    credentials.map((c) => c.key),
  );
  const timeoutMs = options.globals.timeoutMs ?? config.timeoutMs;
  const deadline = new CommandDeadline(timeoutMs, options.monotonicStart);
  const lifetime = new ProcessLifetime(deadline);
  const output: OutputMode = options.globals.output ?? config.defaultOutput;
  const streams = new StreamManager(
    output,
    options.globals.verbose,
    undefined,
    undefined,
    undefined,
    configuredCredentials(config),
  );
  // What plugins add to these tables belongs to this runtime only.
  const errorCodes = new ErrorCodeTable();
  const followUps = new FollowUpTable();
  const formatter = createOutputFormatter(output, streams, options.startedAt, followUps);

  const store = new AtomicFileStore(deadline);
  const configService = new ConfigService(
    new YamlConfigDocument(ConfigLoader.configPath(), store),
    credentials,
  );
  const networkRegistry = new NetworkRegistry(config);
  const prompter = createPrompter(deadline);
  const secrets = new SecretResolver(streams, options.secretPaths, prompter);
  const keystore = new Keystore(root, store, () => secrets.masterPassword());
  const ledger = new Ledger(assertTronTxIntegrity);
  const walletService = new WalletService(
    keystore,
    ledger,
    new SecureBackupWriter(),
    new FileBackupRecordStore(root, store),
  );
  const tokenBook = new TokenBook(root, store);
  const contactBook = new ContactBook(root, store);
  const recipientResolver = new RecipientResolver(contactBook);
  const priceProvider = createPriceProvider(
    config.price,
    // Only explicitly marked testnets receive testnet pricing.
    new Set(
      Object.values(config.networks)
        .filter((n) => n.testnet === true)
        .map((n) => n.id),
    ),
  );
  const gatewayProvider = new ChainGatewayRegistry(familyMap((plugin) => plugin.createGateway));
  const capabilityRegistry = new CapabilityRegistry(config.aliases);
  const signerResolver = new SignerResolver(
    keystore,
    ledger,
    familyMap((definition) => definition.signStrategy),
  );
  const signing = new SigningService(gatewayProvider);
  const txPipeline = new TxPipeline(signerResolver, signing);

  const registry = new CommandRegistry();
  registerWalletCommands(registry, {
    walletService,
    qr: new TerminalQrEncoder(),
  });
  registerConfigCommands(registry, configService);
  registerNetworkCommands(registry);
  registerContactCommands(registry, new ContactService(contactBook));
  registerEncodingCommands(registry, new EncodingService());
  registerAddressCommands(registry, new AddressService(new SecureKeypairWriter(root)));
  const contracts = {
    evm: new EvmContractService(gatewayProvider, txPipeline),
    tron: new TronContractService(gatewayProvider, txPipeline, systemWallClock),
  };
  const accountBalances = new AccountBalanceService(gatewayProvider);
  const tokenBookService = new TokenBookService(tokenBook);
  registerTronChainCommands(registry, {
    gateways: gatewayProvider,
    tokens: tokenBook,
    prices: priceProvider,
    signers: signerResolver,
    signing,
    transactions: txPipeline,
    accounts: keystore,
    tronlink: new TronLinkClient(config, processBroadcastGuard),
    recipients: recipientResolver,
    balances: accountBalances,
    tokenBook: tokenBookService,
    clock: systemWallClock,
  });
  registerEvmChainCommands(registry, {
    signers: signerResolver,
    signing,
    gateways: gatewayProvider,
    balances: accountBalances,
    tokens: tokenBook,
    tokenBook: tokenBookService,
    prices: priceProvider,
    transactions: txPipeline,
    recipients: recipientResolver,
  });

  const services = hostServices({
    signing: new PluginSigning(signerResolver, signing),
    tronCalls: new TronContractCalls(gatewayProvider, txPipeline, systemWallClock),
    tokens: tokenBook,
    aliases: config.aliases,
    networks: networkRegistry,
    lifetime,
    accounts: keystore,
    gateways: gatewayProvider,
    contracts,
    recipients: recipientResolver,
    config,
    broadcastGuard: processBroadcastGuard,
    clock: systemWallClock,
  });
  const pluginTargets = {
    commands: registry,
    capabilities: capabilityRegistry,
    errorCodes,
    followUps,
    networks: Object.values(config.networks),
    services,
    timeoutMs,
  };
  // Installed plugins may not take a word that core commands or families use.
  const reservedWords = new Set([
    ...registry.topLevelWords(),
    ...Object.keys(FAMILIES),
    ...RESERVED_WORDS,
  ]);
  const plugins = new PluginLoader(manifests, pluginTargets);
  registerPluginCommands(
    registry,
    new PluginService(
      pluginStore,
      new PackageSource(),
      {
        reservedWords,
        loadState: (name) => plugins.state(name),
      },
      systemWallClock,
    ),
  );

  // Runs again after installed plugins load; a capability already recorded keeps its result.
  const registerCapabilities = () => {
    const capabilitiesByFamily = registry.capabilityKeysByFamily();
    const neutralCapabilities = registry.neutralCapabilityKeys();
    for (const network of Object.values(config.networks)) {
      capabilityRegistry.register(network, [
        ...(capabilitiesByFamily.get(network.family) ?? []),
        ...neutralCapabilities,
        ...network.capabilities,
      ]);
    }
  };
  registerCapabilities();

  const deps = {
    config,
    deadline,
    networkRegistry,
    streams,
    secrets,
    accounts: walletService,
    prompter,
    formatter,
    followUps,
  };
  const session: SessionRef = {};

  return {
    deadline,
    lifetime,
    migrations: new MigrationService(new FileDataMigrations(store, migrationSteps(root, store))),
    config,
    streams,
    formatter,
    prompter,
    registry,
    deps,
    session,
    capabilities: capabilityRegistry,
    errorCodes,
    followUps,
    plugins,
    registerCapabilities,
    targetResolver: new TargetResolver({ networkRegistry, keystore }),
  };
}

export type CliRuntime = ReturnType<typeof composeCliRuntime>;
