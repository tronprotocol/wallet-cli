import type { DispatchCheck, ExecutionDeadline } from "../contracts/deadline.js";
import type { NetworkDescriptor } from "../../domain/types/index.js";

declare const agentRegistrationMetadata: unique symbol;

// Registration JSON passed through verbatim for display; inner layers never read it.
export interface AgentRegistrationMetadata {
  readonly [agentRegistrationMetadata]: true;
}

// A decoded single return value of an Identity Registry view function.
export type AgentRegistryValue = string | boolean | bigint;

export interface AgentRegistryReader {
  registry(network: NetworkDescriptor): string;
  read(
    deadline: ExecutionDeadline,
    network: NetworkDescriptor,
    method: string,
    params: Array<{ type: string; value: unknown }>,
  ): Promise<AgentRegistryValue>;
  registeredAgentId(
    network: NetworkDescriptor,
    txId: string,
    check: DispatchCheck,
  ): Promise<string | undefined>;
}

export interface AgentRegistrationLoader {
  load(
    uri: string,
    check: DispatchCheck,
  ): Promise<{ metadata?: AgentRegistrationMetadata; warning?: string }>;
}
