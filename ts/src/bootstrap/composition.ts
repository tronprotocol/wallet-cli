import { processBroadcastGuard } from "../application/services/broadcast-guard.js";
import { MessageService } from "../application/use-cases/message-service.js";
import { ManagedX402Server } from "./x402-server-lifecycle.js";
import { setTimeout as delay } from "node:timers/promises";
import { DEFAULT_X402_FACILITATOR_URL } from "../adapters/outbound/config/x402-builtins.js";
import { setLogger, noopLogger } from "@bankofai/x402-core";
import { BaiWalletBinding, baiChain } from "../application/use-cases/bai-wallet-binding.js";
import { BaiRechargeClient } from "../adapters/outbound/bai/recharge-client.js";
import { BAI_RECHARGE_ADDRESSES } from "../adapters/outbound/config/bai-builtins.js";
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
import { X402Permit2Approvals } from "../application/use-cases/x402-permit2-approval.js";
import { ConfigService } from "../application/use-cases/config-service.js";
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
import { RegistrationLoader } from "../adapters/outbound/erc8004/registration-loader.js";
import { AgentService } from "../application/use-cases/agent-service.js";
import { X402PaymentClient } from "../adapters/outbound/x402/payment-client.js";
import { X402ProviderCatalog } from "../adapters/outbound/x402/provider-catalog.js";
import { X402Service } from "../application/use-cases/x402-service.js";
import { registerX402Commands } from "../adapters/inbound/cli/commands/x402.js";
import { X402HttpServer } from "../adapters/outbound/x402/server.js";

export interface BootstrapOptions {
  readonly globals: Globals;
  readonly secretPaths: SecretPaths;
  readonly startedAt: number;
}

export function composeCliRuntime(options: BootstrapOptions) {
  // Suppress SDK logs to protect the result envelope and request URLs.
  setLogger(noopLogger);
  const config = ConfigLoader.load();
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
    // Only explicitly marked testnets receive testnet pricing.
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
  const routerPlanner = new SunSwapRouterPlanner(gatewayProvider);
  const capabilityRegistry = new CapabilityRegistry(config.aliases);
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
  const x402Payments = new X402PaymentClient(undefined, undefined, config);
  const x402Service = new X402Service(
    x402Payments,
    signerResolver,
    new X402ProviderCatalog(undefined, undefined, timeoutMs),
    networkRegistry,
    new ManagedX402Server(
      new X402HttpServer(undefined, timeoutMs, undefined, (line) =>
        streams.diagnostic("debug", line),
      ),
    ),
    new X402Permit2Approvals(gatewayProvider, txPipeline),
  );
  registerBaiCommands(
    registry,
    new BaiService(
      new BaiClient(config, timeoutMs),
      () => new Date(),
      x402Service,
      new BaiWalletBinding(new MessageService(signerResolver)),
      new BaiRechargeClient(config, timeoutMs),
      { facilitatorUrl: DEFAULT_X402_FACILITATOR_URL, payTo: BAI_RECHARGE_ADDRESSES },
      { initialDelayMs: baiReportDelayMs(), wait: delay },
      gatewayProvider,
      keystore,
    ),
  );
  const agentContracts = {
    evm: new EvmContractService(gatewayProvider, txPipeline),
    tron: new TronContractService(gatewayProvider, txPipeline),
  };
  const agents = new AgentService(
    agentContracts,
    new SdkAgentRegistry(agentContracts, gatewayProvider),
    new RegistrationLoader(timeoutMs),
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
    transactions: txPipeline,
    accounts: keystore,
    timeoutMs,
    tronlink: new TronLinkClient(config, timeoutMs, processBroadcastGuard),
    gasfree: new GasFreeClient(config, timeoutMs, processBroadcastGuard),
    sunswapMarket: new SunSwapMarketApi(timeoutMs),
    sunswapLiquidity: new SunSwapLiquidityContracts(gatewayProvider),
    sunpumpLaunchpad: new SunPumpLaunchpadContracts(gatewayProvider),
    sunpumpMarket: new SunPumpMarketApi(timeoutMs),
    sunpumpLaunch: new SunPumpLaunchApi(timeoutMs, processBroadcastGuard),
    sunswapRouter: new SunSwapRouterApi(timeoutMs),
    sunswapRouterPlanner: routerPlanner,
    // Share the cached chain clock so router and permit deadlines agree.
    sunswapPermits: routerPlanner,
    aliases: config.aliases,
    recipients: recipientResolver,
    balances: accountBalances,
    tokenBook: tokenBookService,
  });
  registerEvmChainCommands(registry, {
    agents,
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
      // Market data, liquidity, and swaps require independent capability gates.
      .filter(
        (key) =>
          key !== "sunswap.market" ||
          (isTronNetwork(network) && Boolean(network.sunswap?.marketApiBaseUrl)),
      )
      // Contract liquidity can be available without a market API.
      .filter(
        (key) =>
          key !== "sunswap.liquidity" ||
          (isTronNetwork(network) && network.sunswap?.liquidity === true),
      )
      // Curve access requires explicit configuration, even when SDK addresses exist.
      .filter(
        (key) =>
          key !== "sunpump.curve" || (isTronNetwork(network) && network.sunpump?.curve === true),
      )
      .filter(
        (key) =>
          key !== "sunpump.market" ||
          (isTronNetwork(network) && Boolean(network.sunpump?.apiBaseUrl)),
      )
      .filter(
        (key) =>
          key !== "sunpump.launch" ||
          (isTronNetwork(network) && Boolean(network.sunpump?.apiBaseUrl)),
      )
      .filter(
        (key) =>
          key !== "sunswap.swap" ||
          (isTronNetwork(network) &&
            (network.sunpump?.curve === true || Boolean(network.sunswap?.routerApiBaseUrl))),
      )
      .map((key) => ({
        key,
        summary: CAP_SUMMARIES[key] ?? key,
      }));
    // Family-neutral commands are absent from capabilityKeysByFamily.
    commandCapabilities.push({
      key: "x402.pay",
      summary: "Inspect or pay an x402 endpoint using the selected wallet network",
    });
    commandCapabilities.push({
      key: "x402.serve",
      summary: "Serve a local x402 endpoint; the server validates network token support",
    });
    if (baiChain(network)) {
      commandCapabilities.push({
        key: "bai.recharge",
        summary: "Recharge B.AI from a configured payer wallet",
      });
    }
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

function baiReportDelayMs(): number {
  const raw = process.env.WALLET_CLI_BAI_REPORT_DELAY_MS;
  return raw !== undefined && /^\d{1,7}$/.test(raw) ? Number(raw) : 15_000;
}
