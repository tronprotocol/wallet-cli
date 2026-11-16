import type { AgentContractPorts } from "../../../application/ports/agent-registry.js";
import { agentWriteError } from "./revert.js";

// Registry writes fail with the error code their contract revert maps to.
export function registryContracts(contracts: AgentContractPorts): AgentContractPorts {
  return {
    evm: {
      call: (...args) => contracts.evm.call(...args),
      send: (...args) => mappingReverts(contracts.evm.send(...args)),
    },
    tron: {
      call: (...args) => contracts.tron.call(...args),
      send: (...args) => mappingReverts(contracts.tron.send(...args)),
    },
  };
}

async function mappingReverts<T>(write: Promise<T>): Promise<T> {
  try {
    return await write;
  } catch (error) {
    throw agentWriteError(error) ?? error;
  }
}
