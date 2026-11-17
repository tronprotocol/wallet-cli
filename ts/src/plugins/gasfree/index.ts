import {
  PLUGIN_API_REVISION,
  PLUGIN_API_VERSION,
  type PluginDefinition,
} from "../../plugin-api/index.js";
import { GasFreeClient } from "./adapters/outbound/gasfree/client.js";
import { GasFreeService } from "./application/use-cases/gasfree-service.js";
import { GASFREE_CAPABILITIES } from "./application/capabilities.js";
import { GASFREE_ERROR_CODES } from "./domain/errors.js";
import { GASFREE_CREDENTIALS } from "./domain/credentials.js";
import { GASFREE_FOLLOW_UPS } from "./adapters/inbound/follow-ups.js";
import {
  gasFreeInfoSpec,
  gasFreeInfoTronBinding,
  gasFreeTraceSpec,
  gasFreeTraceTronBinding,
  gasFreeTransferSpec,
  gasFreeTransferTronBinding,
} from "./adapters/inbound/commands.js";

const gasfree: PluginDefinition = {
  name: "gasfree",
  version: "1.0.0",
  apiVersion: PLUGIN_API_VERSION,
  apiRevision: PLUGIN_API_REVISION,
  groups: [
    {
      name: "gasfree",
      summary: "Gas-free token transfers via the GasFree service",
      description:
        "Gas-free token transfers via the GasFree service (open.gasfree.io).\nFees are charged in the transferred token — a per-transfer service fee, plus a one-time\nactivation fee on the first transfer from an inactive GasFree address — so no TRX is needed.\nRequires API credentials (config gasfreeApiKey / gasfreeApiSecret).",
      families: ["tron"],
    },
  ],
  credentials: GASFREE_CREDENTIALS,
  register(host) {
    const { services } = host;
    const service = new GasFreeService(
      new GasFreeClient(services.config, services.broadcastGuard),
      services.gateways,
      services.signing,
      services.recipients,
      services.config,
      services.clock,
    );
    host.errorCodes(GASFREE_ERROR_CODES);
    host.capabilities(GASFREE_CAPABILITIES);
    host.followUps(GASFREE_FOLLOW_UPS);
    host.chainCommand(gasFreeInfoSpec, "tron", gasFreeInfoTronBinding(service));
    host.chainCommand(gasFreeTransferSpec, "tron", gasFreeTransferTronBinding(service));
    host.chainCommand(gasFreeTraceSpec, "tron", gasFreeTraceTronBinding(service));
  },
};

export default gasfree;
