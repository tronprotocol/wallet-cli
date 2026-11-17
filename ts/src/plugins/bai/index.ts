import { setTimeout as delay } from "node:timers/promises";
import {
  PLUGIN_API_REVISION,
  PLUGIN_API_VERSION,
  type PluginDefinition,
} from "../../plugin-api/index.js";
import type { PluginCommandContext } from "../../plugin-api/cli.js";
import type { HostServices } from "../../plugin-api/application.js";
import { networkBlock, type NetworkDescriptor } from "../../plugin-api/domain.js";
import { GASFREE_CREDENTIALS } from "./domain/credentials.js";
import { gasfreeNetworkConfig, type GasFreeNetworkConfig } from "./domain/network.js";
import { X402_ERROR_CODES, X402_GASFREE_ERROR_CODES } from "./domain/x402-errors.js";
import { DEFAULT_X402_FACILITATOR_URL } from "./application/services/facilitator.js";
import { X402FacilitatorClient } from "./adapters/outbound/x402/facilitator-client.js";
import { X402PaymentClient } from "./adapters/outbound/x402/payment-client.js";
import { X402ProviderCatalog } from "./adapters/outbound/x402/provider-catalog.js";
import { createX402DaemonLog } from "./adapters/outbound/x402/daemon-log.js";
import { X402PaywallHttpServer } from "./adapters/inbound/http/paywall-server.js";
import { ManagedX402Server } from "./adapters/inbound/http/server-lifecycle.js";
import type { DaemonRole } from "./adapters/inbound/http/daemon.js";
import { X402Service } from "./application/use-cases/x402-service.js";
import { X402Permit2Approvals } from "./application/use-cases/x402-permit2-approval.js";
import { BaiClient } from "./adapters/outbound/bai/client.js";
import { BaiRechargeClient } from "./adapters/outbound/bai/recharge-client.js";
import { BAI_RECHARGE_ADDRESSES } from "./domain/recharge-addresses.js";
import { BaiService } from "./application/use-cases/bai-service.js";
import { BaiWalletBinding } from "./application/use-cases/bai-wallet-binding.js";
import { baiReportDelayMs } from "./application/use-cases/bai-report-delay.js";
import { BAI_CAPABILITIES } from "./application/capabilities.js";
import { BAI_FOLLOW_UPS } from "./adapters/inbound/follow-ups.js";
import { baiCommands, baiRechargeBinding, baiRechargeSpec } from "./adapters/inbound/commands.js";
import { BAI_ERROR_CODES } from "./domain/errors.js";

// The GasFree service of a network, as the network's gasfree block resolves it.
function gasfreeOpenApi(network: NetworkDescriptor): GasFreeNetworkConfig | null | undefined {
  return gasfreeNetworkConfig(network, networkBlock(network, "gasfree"));
}

// A process that never runs a detached server.
const NO_DAEMON: DaemonRole = { child: false, childEnv: () => ({}) };

// Builds the x402 service for one command run from the host services.
function x402ServiceFactory(
  services: HostServices,
  facilitator: X402FacilitatorClient = new X402FacilitatorClient(),
  daemon: DaemonRole = NO_DAEMON,
): (ctx: PluginCommandContext) => X402Service {
  const payments = new X402PaymentClient(undefined, undefined, {
    gasfreeApiKey: services.config.credential("gasfreeApiKey"),
    gasfreeApiSecret: services.config.credential("gasfreeApiSecret"),
    gasfreeOpenApi,
  });
  const catalog = new X402ProviderCatalog();
  const approvals = new X402Permit2Approvals(services.tronCalls);
  return (ctx) =>
    new X402Service(
      payments,
      services.signing,
      catalog,
      services.networks,
      services.broadcastGuard,
      {
        facilitator,
        host: new ManagedX402Server(
          new X402PaywallHttpServer(
            (line) => ctx.log.line(line),
            (line) => ctx.log.diagnostic("debug", line),
          ),
          createX402DaemonLog,
          services.lifetime,
          ctx.timeoutMs,
          daemon,
        ),
        requestTimeoutMs: ctx.timeoutMs,
      },
      approvals,
    );
}

const bai: PluginDefinition = {
  name: "bai",
  version: "1.0.0",
  apiVersion: PLUGIN_API_VERSION,
  apiRevision: PLUGIN_API_REVISION,
  groups: [
    {
      name: "bai",
      summary: "Query and recharge a B.AI account",
      description: "Query B.AI account credits, usage records, and recharge orders.",
      families: [],
    },
  ],
  // The GasFree keys are read for the GasFree relay of the x402 payment.
  credentials: [
    ...GASFREE_CREDENTIALS,
    {
      key: "baiApiKey",
      summary:
        "B.AI API key, saved locally with no network or wallet binding, which recharge checks when used",
    },
  ],
  register(host) {
    const { services } = host;
    const credentials = { baiApiKey: services.config.credential("baiApiKey") };
    const x402For = x402ServiceFactory(services);
    // B.AI pays through x402; both are built for the command run.
    const serviceFor = (ctx: PluginCommandContext) =>
      new BaiService(
        new BaiClient(credentials),
        () => new Date(),
        x402For(ctx),
        new BaiWalletBinding(services.signing),
        new BaiRechargeClient(credentials),
        { facilitatorUrl: DEFAULT_X402_FACILITATOR_URL, payTo: BAI_RECHARGE_ADDRESSES },
        {
          initialDelayMs: baiReportDelayMs(process.env.WALLET_CLI_BAI_REPORT_DELAY_MS),
          wait: (ms, signal) => delay(ms, undefined, { signal }),
        },
        services.gateways,
        services.accounts,
      );
    host.errorCodes({ ...BAI_ERROR_CODES, ...X402_ERROR_CODES, ...X402_GASFREE_ERROR_CODES });
    host.capabilities(BAI_CAPABILITIES);
    host.followUps(BAI_FOLLOW_UPS);
    host.chainCommand(
      baiRechargeSpec,
      "tron",
      baiRechargeBinding(serviceFor, credentials.baiApiKey),
    );
    host.chainCommand(
      baiRechargeSpec,
      "evm",
      baiRechargeBinding(serviceFor, credentials.baiApiKey),
    );
    for (const command of baiCommands(serviceFor)) host.command(command);
  },
};

export default bai;
