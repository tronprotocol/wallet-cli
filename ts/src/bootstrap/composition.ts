import { isTronNetwork } from "../domain/types/network.js";
import type { OutputMode } from "../domain/types/index.js";
import type { Globals, SessionRef } from "../adapters/inbound/cli/contracts/index.js";
import { ConfigLoader, NetworkRegistry } from "../adapters/outbound/config/index.js";
import { YamlConfigDocument } from "../adapters/outbound/config/yaml-config-document.js";
import { CAP_SUMMARIES, TRAIT_SUMMARIES } from "../adapters/outbound/config/builtins.js";
import { AtomicFileStore } from "../adapters/outbound/persistence/fs/index.js";
import { SecureBackupWriter } from "../adapters/outbound/persistence/backup-writer.js";
import { FileBackupRecordStore } from "../adapters/outbound/persistence/backup-records.js";
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
import { familyMap } from "./family-registry.js";
import { registerTronChainCommands } from "./families/tron.js";
import { registerEvmChainCommands } from "./families/evm.js";
import { AccountBalanceService } from "../application/use-cases/account-balance-service.js";
import { TokenBookService } from "../application/use-cases/token-book-service.js";
import { TronLinkClient } from "../adapters/outbound/tronlink/client.js";
import { GasFreeClient } from "../adapters/outbound/gasfree/client.js";
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
  const configService = new ConfigService(new YamlConfigDocument(ConfigLoader.configPath(), store));
  const networkRegistry = new NetworkRegistry(config);
  const prompter = createPrompter();
  const secrets = new SecretResolver(streams, options.secretPaths, prompter);
  const keystore = new Keystore(root, store, () => secrets.masterPassword());
  const ledger = new Ledger(timeoutMs);
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
    timeoutMs,
    // Declared per network (§2.2), never inferred from the id: a user-configured chain we know
    // nothing about stays unpriced (null = unknown), which is not the same as worth nothing.
    new Set(
      Object.values(config.networks)
        .filter((n) => n.testnet === true)
        .map((n) => n.id),
    ),
  );
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
  registerWalletCommands(registry, {
    walletService,
    ledger,
    qr: new TerminalQrEncoder(),
  });
  registerConfigCommands(registry, configService);
  registerNetworkCommands(registry);
  registerContactCommands(registry, new ContactService(contactBook));
  registerEncodingCommands(registry, new EncodingService());
  registerAddressCommands(registry, new AddressService(new SecureKeypairWriter(root)));
  const accountBalances = new AccountBalanceService(gatewayProvider);
  const tokenBookService = new TokenBookService(tokenBook);
  registerTronChainCommands(registry, {
    gateways: gatewayProvider,
    tokens: tokenBook,
    prices: priceProvider,
    signers: signerResolver,
    transactions: txPipeline,
    accounts: keystore,
    timeoutMs,
    tronlink: new TronLinkClient(config, timeoutMs),
    gasfree: new GasFreeClient(config, timeoutMs),
    recipients: recipientResolver,
    balances: accountBalances,
    tokenBook: tokenBookService,
  });
  registerEvmChainCommands(registry, {
    signers: signerResolver,
    gateways: gatewayProvider,
    balances: accountBalances,
    tokens: tokenBook,
    tokenBook: tokenBookService,
    prices: priceProvider,
    transactions: txPipeline,
    recipients: recipientResolver,
  });

  const capabilitiesByFamily = registry.capabilityKeysByFamily();
  for (const network of Object.values(config.networks)) {
    const commandCapabilities = (capabilitiesByFamily.get(network.family) ?? [])
      .filter(
        (key) =>
          key !== "tx.multisig.tronlink" ||
          (isTronNetwork(network) && Boolean(network.tronlinkHttpEndpoint)),
      )
      .filter(
        (key) =>
          !key.startsWith("gasfree.") || (isTronNetwork(network) && Boolean(network.gasfree)),
      )
      .map((key) => ({
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
    root,
    store,
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
