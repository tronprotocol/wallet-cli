import { processBroadcastGuard } from "../application/services/broadcast-guard.js";
import { CommandDeadline } from "../application/services/command-deadline.js";
import { systemWallClock } from "../application/contracts/wall-clock.js";
import { MessageSigner } from "../application/services/signing/message-signer.js";
import { ManagedX402Server } from "./x402-server-lifecycle.js";
import { daemonChildTimeoutMs } from "./x402-daemon.js";
import { ProcessLifetime } from "./process-lifetime.js";
import { setTimeout as delay } from "node:timers/promises";
import { DEFAULT_X402_FACILITATOR_URL } from "../application/services/x402/facilitator.js";
import { BaiWalletBinding } from "../application/use-cases/bai-wallet-binding.js";
import { baiReportDelayMs } from "../application/use-cases/bai-report-delay.js";
import { MigrationService } from "../application/use-cases/migration-service.js";
import { FileDataMigrations } from "../adapters/outbound/persistence/migration.js";
import { migrationSteps } from "./migration-steps.js";
import { BaiRechargeClient } from "../adapters/outbound/bai/recharge-client.js";
import { BAI_RECHARGE_ADDRESSES } from "../adapters/outbound/config/bai-builtins.js";
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
import { registerWalletCommands } from "../adapters/inbound/cli/commands/wallet.js";
import { registerConfigCommands } from "../adapters/inbound/cli/commands/config.js";
import { registerNetworkCommands } from "../adapters/inbound/cli/commands/network.js";
import { CapabilityRegistry } from "../application/services/capability/index.js";
import { SignerResolver } from "../application/services/signer/index.js";
import { TargetResolver } from "../application/services/target/index.js";
import { TxPipeline } from "../application/services/pipeline/index.js";
import { SigningService } from "../application/services/signing/signing-service.js";
import { X402Permit2Approvals } from "../application/use-cases/x402-permit2-approval.js";
import { ConfigService, configuredCredentials } from "../application/use-cases/config-service.js";
import { WalletService } from "../application/use-cases/wallet-service.js";
import { familyMap } from "./family-registry.js";
import { registerTronChainCommands } from "./families/tron.js";
import { registerEvmChainCommands } from "./families/evm.js";
import { AccountBalanceService } from "../application/use-cases/account-balance-service.js";
import { TokenBookService } from "../application/use-cases/token-book-service.js";
import { TronLinkClient } from "../adapters/outbound/tronlink/client.js";
import { GasFreeClient } from "../adapters/outbound/gasfree/client.js";
import { SunSwapMarketApi } from "../adapters/outbound/sunswap/market-api.js";
import { SunSwapLiquidityContracts } from "../adapters/outbound/sunswap/liquidity-contracts.js";
import { SunPumpLaunchpadContracts } from "../adapters/outbound/sunpump/launchpad-contracts.js";
import { SunPumpMarketApi } from "../adapters/outbound/sunpump/market-api.js";
import { SunPumpLaunchApi } from "../adapters/outbound/sunpump/launch-api.js";
import { SunSwapRouterApi } from "../adapters/outbound/sunswap/router-api.js";
import { SunSwapRouterPlanner } from "../adapters/outbound/sunswap/router-plan.js";
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
import { BaiClient } from "../adapters/outbound/bai/client.js";
import { BaiService } from "../application/use-cases/bai-service.js";
import { registerBaiCommands } from "../adapters/inbound/cli/commands/bai.js";
import { EvmContractService } from "../application/use-cases/evm/contract-service.js";
import { TronContractService } from "../application/use-cases/tron/contract-service.js";
import { SdkAgentRegistry } from "../adapters/outbound/erc8004/sdk-registry.js";
import { registryContracts } from "../adapters/outbound/erc8004/registry-contracts.js";
import { RegistrationLoader } from "../adapters/outbound/erc8004/registration-loader.js";
import { AgentService } from "../application/use-cases/agent-service.js";
import { X402PaymentClient } from "../adapters/outbound/x402/payment-client.js";
import { X402ProviderCatalog } from "../adapters/outbound/x402/provider-catalog.js";
import { X402Service } from "../application/use-cases/x402-service.js";
import { registerX402Commands } from "../adapters/inbound/cli/commands/x402.js";
import { X402FacilitatorClient } from "../adapters/outbound/x402/facilitator-client.js";
import { createX402DaemonLog } from "../adapters/outbound/x402/daemon-log.js";
import { X402PaywallHttpServer } from "../adapters/inbound/http/x402/paywall-server.js";

export interface BootstrapOptions {
  readonly globals: Globals;
  readonly secretPaths: SecretPaths;
  readonly startedAt: number;
  // performance.now() when the command started; the deadline counts from here.
  readonly monotonicStart: number;
}

export function composeCliRuntime(options: BootstrapOptions) {
  const config = ConfigLoader.load();
  const timeoutMs = daemonChildTimeoutMs() ?? options.globals.timeoutMs ?? config.timeoutMs;
  const deadline = new CommandDeadline(timeoutMs, options.monotonicStart);
  const lifetime = new ProcessLifetime(deadline);
  const output: OutputMode = options.globals.output ?? config.defaultOutput;
  const streams = new StreamManager(output, options.globals.verbose);
  const credentials = configuredCredentials(config);
  const formatter = createOutputFormatter(output, streams, options.startedAt, credentials);

  const root = ConfigLoader.resolveRoot();
  const store = new AtomicFileStore(deadline);
  const configService = new ConfigService(new YamlConfigDocument(ConfigLoader.configPath(), store));
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
  const routerPlanner = new SunSwapRouterPlanner(gatewayProvider);
  const x402Facilitator = new X402FacilitatorClient();
  const capabilityRegistry = new CapabilityRegistry(config.aliases, {
    x402TokenRegistered: (network, symbol) =>
      x402Facilitator.assetBySymbol(network, "exact", symbol) !== undefined,
  });
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
  const x402Payments = new X402PaymentClient(undefined, undefined, config);
  const x402Service = new X402Service(
    x402Payments,
    signerResolver,
    new X402ProviderCatalog(),
    networkRegistry,
    {
      facilitator: x402Facilitator,
      host: new ManagedX402Server(
        new X402PaywallHttpServer(
          (line) => streams.errorLine(line),
          (line) => streams.diagnostic("debug", line),
        ),
        createX402DaemonLog,
        lifetime,
        timeoutMs,
      ),
      requestTimeoutMs: timeoutMs,
    },
    new X402Permit2Approvals(gatewayProvider, txPipeline, systemWallClock),
    signing,
  );
  registerBaiCommands(
    registry,
    new BaiService(
      new BaiClient(config),
      () => new Date(),
      x402Service,
      new BaiWalletBinding(new MessageSigner(signerResolver, signing)),
      new BaiRechargeClient(config),
      { facilitatorUrl: DEFAULT_X402_FACILITATOR_URL, payTo: BAI_RECHARGE_ADDRESSES },
      {
        initialDelayMs: baiReportDelayMs(process.env.WALLET_CLI_BAI_REPORT_DELAY_MS),
        wait: (ms, signal) => delay(ms, undefined, { signal }),
      },
      gatewayProvider,
      keystore,
    ),
  );
  const agentContracts = {
    evm: new EvmContractService(gatewayProvider, txPipeline),
    tron: new TronContractService(gatewayProvider, txPipeline, systemWallClock),
  };
  const agents = new AgentService(
    registryContracts(agentContracts),
    new SdkAgentRegistry(agentContracts, gatewayProvider),
    new RegistrationLoader(),
  );
  registerX402Commands(registry, x402Service);
  const accountBalances = new AccountBalanceService(gatewayProvider);
  const tokenBookService = new TokenBookService(tokenBook);
  registerTronChainCommands(registry, {
    agents,
    gateways: gatewayProvider,
    tokens: tokenBook,
    prices: priceProvider,
    signers: signerResolver,
    signing,
    transactions: txPipeline,
    accounts: keystore,
    tronlink: new TronLinkClient(config, processBroadcastGuard),
    gasfree: new GasFreeClient(config, processBroadcastGuard),
    sunswapMarket: new SunSwapMarketApi(),
    sunswapLiquidity: new SunSwapLiquidityContracts(gatewayProvider),
    sunpumpLaunchpad: new SunPumpLaunchpadContracts(gatewayProvider),
    sunpumpMarket: new SunPumpMarketApi(),
    sunpumpLaunch: new SunPumpLaunchApi(processBroadcastGuard),
    sunswapRouter: new SunSwapRouterApi(),
    sunswapRouterPlanner: routerPlanner,
    // Share the cached chain clock so router and permit deadlines agree.
    sunswapPermits: routerPlanner,
    aliases: config.aliases,
    recipients: recipientResolver,
    balances: accountBalances,
    tokenBook: tokenBookService,
    clock: systemWallClock,
  });
  registerEvmChainCommands(registry, {
    agents,
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

  const capabilitiesByFamily = registry.capabilityKeysByFamily();
  const neutralCapabilities = registry.neutralCapabilityKeys();
  for (const network of Object.values(config.networks)) {
    capabilityRegistry.register(network, [
      ...(capabilitiesByFamily.get(network.family) ?? []),
      ...neutralCapabilities,
      ...network.capabilities,
    ]);
  }

  const deps = {
    config,
    deadline,
    networkRegistry,
    streams,
    secrets,
    accounts: walletService,
    prompter,
    formatter,
  };
  const session: SessionRef = {};

  return {
    deadline,
    lifetime,
    migrations: new MigrationService(new FileDataMigrations(store, migrationSteps(root, store))),
    config,
    credentials,
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
