import type { NetworkDescriptor } from "../../domain/types/index.js";

export interface AgentRegistryReader {
  registry(network: NetworkDescriptor): string;
  read(
    network: NetworkDescriptor,
    method: string,
    params: Array<{ type: string; value: unknown }>,
  ): Promise<unknown>;
  registeredAgentId(network: NetworkDescriptor, txId: string): Promise<string | undefined>;
}

export interface AgentRegistrationLoader {
  load(uri: string): Promise<{ metadata?: Record<string, unknown>; warning?: string }>;
}
