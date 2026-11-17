import type { HostServices } from "../../plugin-api/application.js";
import type { PluginCommandContext } from "../../plugin-api/cli.js";
import { GASFREE_CREDENTIALS, GASFREE_SHARED_ERROR_CODES, gasfreeOpenApi } from "../gasfree/api.js";
import { X402_ERROR_CODES } from "./domain/errors.js";
import { X402FacilitatorClient } from "./adapters/outbound/x402/facilitator-client.js";
import { X402PaymentClient } from "./adapters/outbound/x402/payment-client.js";
import { X402ProviderCatalog } from "./adapters/outbound/x402/provider-catalog.js";
import { createX402DaemonLog } from "./adapters/outbound/x402/daemon-log.js";
import { X402PaywallHttpServer } from "./adapters/inbound/http/paywall-server.js";
import { ManagedX402Server } from "./adapters/inbound/http/server-lifecycle.js";
import type { DaemonRole } from "./adapters/inbound/http/daemon.js";
import { X402Service } from "./application/use-cases/x402-service.js";
import { X402Permit2Approvals } from "./application/use-cases/x402-permit2-approval.js";

export type { X402Service } from "./application/use-cases/x402-service.js";
export type { DaemonRole } from "./adapters/inbound/http/daemon.js";

// The GasFree keys, read for the GasFree relay.
export const X402_CREDENTIALS = GASFREE_CREDENTIALS;

// The codes a plugin that pays through x402 can raise from x402's own code.
export const X402_SHARED_ERROR_CODES = {
  ...GASFREE_SHARED_ERROR_CODES,
  invalid_x402_response: X402_ERROR_CODES.invalid_x402_response,
  payer_mismatch: X402_ERROR_CODES.payer_mismatch,
};

// A process that never runs a detached server.
const NO_DAEMON: DaemonRole = { child: false, childEnv: () => ({}) };

// Builds the x402 service for one command run from the host services; B.AI pays through it.
export function x402ServiceFactory(
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

export type {
  X402Roundtrip,
  X402RoundtripPort,
  X402ServeDetails,
  X402ServeInput,
} from "./application/ports/x402-server.js";
export type { X402PaymentResult, X402ResponseResult } from "./application/ports/x402-payment.js";
export { sameX402Network, x402NetworkFamily } from "./domain/network-id.js";
export { DEFAULT_X402_FACILITATOR_URL } from "./application/services/facilitator.js";
export {
  integerLiteral,
  paymentAmount,
  rawPaymentAmount,
} from "./adapters/inbound/payment-values.js";
