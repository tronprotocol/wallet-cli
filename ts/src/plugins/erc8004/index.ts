import {
  PLUGIN_API_REVISION,
  PLUGIN_API_VERSION,
  type PluginDefinition,
} from "../../plugin-api/index.js";
import { AgentService } from "./application/use-cases/agent-service.js";
import { ERC8004_CAPABILITIES } from "./application/capabilities.js";
import { ERC8004_ERROR_CODES } from "./domain/errors.js";
import { registryContracts } from "./adapters/outbound/erc8004/registry-contracts.js";
import { SdkAgentRegistry } from "./adapters/outbound/erc8004/sdk-registry.js";
import { RegistrationLoader } from "./adapters/outbound/erc8004/registration-loader.js";
import { ERC8004_COMMANDS } from "./adapters/inbound/commands.js";

const erc8004: PluginDefinition = {
  name: "erc8004",
  version: "1.0.0",
  apiVersion: PLUGIN_API_VERSION,
  apiRevision: PLUGIN_API_REVISION,
  groups: [
    {
      name: "8004",
      summary: "Read and manage ERC-8004 Agent identities",
      description: "Read and manage ERC-8004 Agent identities on supported networks.",
      families: ["tron", "evm"],
    },
  ],
  register(host) {
    const { contracts, gateways } = host.services;
    const service = new AgentService(
      registryContracts(contracts),
      new SdkAgentRegistry(contracts, gateways),
      new RegistrationLoader(),
    );
    host.errorCodes(ERC8004_ERROR_CODES);
    host.capabilities(ERC8004_CAPABILITIES);
    for (const { spec, tron, evm } of ERC8004_COMMANDS) {
      host.chainCommand(spec, "tron", tron(service));
      host.chainCommand(spec, "evm", evm(service));
    }
  },
};

export default erc8004;
