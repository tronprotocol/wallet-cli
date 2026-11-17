import {
  PLUGIN_API_REVISION,
  PLUGIN_API_VERSION,
  type PluginDefinition,
} from "../../plugin-api/index.js";
import type { HostServices } from "../../plugin-api/application.js";
import type { PluginCommandContext } from "../../plugin-api/cli.js";
import { networkBlock, type NetworkDescriptor } from "../../plugin-api/domain.js";
import { GASFREE_CREDENTIALS } from "./domain/credentials.js";
import { gasfreeNetworkConfig, type GasFreeNetworkConfig } from "./domain/network.js";
import { X402FacilitatorClient } from "./adapters/outbound/x402/facilitator-client.js";
import { X402PaymentClient } from "./adapters/outbound/x402/payment-client.js";
import { X402ProviderCatalog } from "./adapters/outbound/x402/provider-catalog.js";
import { createX402DaemonLog } from "./adapters/outbound/x402/daemon-log.js";
import { X402PaywallHttpServer } from "./adapters/inbound/http/paywall-server.js";
import { ManagedX402Server } from "./adapters/inbound/http/server-lifecycle.js";
import type { DaemonRole } from "./adapters/inbound/http/daemon.js";
import { X402Service } from "./application/use-cases/x402-service.js";
import { X402Permit2Approvals } from "./application/use-cases/x402-permit2-approval.js";
import { x402Commands } from "./adapters/inbound/commands.js";
import { x402Capabilities } from "./application/capabilities.js";
import { X402_ERROR_CODES, X402_GASFREE_ERROR_CODES } from "./domain/errors.js";

const DAEMON_CHILD = "WALLET_CLI_X402_DAEMON_CHILD";

// The GasFree service of a network, as the network's gasfree block resolves it.
function gasfreeOpenApi(network: NetworkDescriptor): GasFreeNetworkConfig | null | undefined {
  return gasfreeNetworkConfig(network, networkBlock(network, "gasfree"));
}

// Builds the x402 service for one command run from the host services.
function x402ServiceFactory(
  services: HostServices,
  facilitator: X402FacilitatorClient,
  daemon: DaemonRole,
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

const x402: PluginDefinition = {
  name: "x402",
  version: "1.0.0",
  apiVersion: PLUGIN_API_VERSION,
  apiRevision: PLUGIN_API_REVISION,
  groups: [
    {
      name: "x402",
      summary: "Pay and inspect x402 service providers",
      description: "Pay x402 endpoints and inspect the provider catalog.",
      families: [],
    },
  ],
  // The GasFree keys, read for the GasFree relay.
  credentials: GASFREE_CREDENTIALS,
  register(host) {
    const facilitator = new X402FacilitatorClient();
    // A detached `x402 serve` runs this CLI again; the variable marks that child.
    const serviceFor = x402ServiceFactory(host.services, facilitator, {
      child: process.env[DAEMON_CHILD] === "1",
      childEnv: () => ({ ...process.env, [DAEMON_CHILD]: "1" }),
    });
    host.errorCodes({ ...X402_ERROR_CODES, ...X402_GASFREE_ERROR_CODES });
    host.capabilities(
      x402Capabilities(
        (network, symbol) => facilitator.assetBySymbol(network, "exact", symbol) !== undefined,
      ),
    );
    for (const command of x402Commands(serviceFor)) host.command(command);
  },
};

export default x402;
