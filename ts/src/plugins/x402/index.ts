import {
  PLUGIN_API_REVISION,
  PLUGIN_API_VERSION,
  type PluginDefinition,
} from "../../plugin-api/index.js";
import { X402_CREDENTIALS, x402ServiceFactory } from "./api.js";
import { GASFREE_SHARED_ERROR_CODES } from "../gasfree/api.js";
import { X402FacilitatorClient } from "./adapters/outbound/x402/facilitator-client.js";
import { x402Commands } from "./adapters/inbound/commands.js";
import { x402Capabilities } from "./application/capabilities.js";
import { X402_ERROR_CODES } from "./domain/errors.js";

const DAEMON_CHILD = "WALLET_CLI_X402_DAEMON_CHILD";

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
  credentials: X402_CREDENTIALS,
  register(host) {
    const facilitator = new X402FacilitatorClient();
    // A detached `x402 serve` runs this CLI again; the variable marks that child.
    const serviceFor = x402ServiceFactory(host.services, facilitator, {
      child: process.env[DAEMON_CHILD] === "1",
      childEnv: () => ({ ...process.env, [DAEMON_CHILD]: "1" }),
    });
    host.errorCodes({ ...X402_ERROR_CODES, ...GASFREE_SHARED_ERROR_CODES });
    host.capabilities(
      x402Capabilities(
        (network, symbol) => facilitator.assetBySymbol(network, "exact", symbol) !== undefined,
      ),
    );
    for (const command of x402Commands(serviceFor)) host.command(command);
  },
};

export default x402;
