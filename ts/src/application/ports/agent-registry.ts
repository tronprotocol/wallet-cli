import type { NetworkDescriptor, TxReceiptView } from "../../domain/types/index.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type {
  EvmContractWriteInput,
  ApprovalKind,
  GovernanceTransactionInput,
} from "../contracts/transaction-input.js";
import type { TronContractParameter } from "./chain/tron-gateway.js";
import type { Sun } from "../../domain/amounts/index.js";

export interface EvmContractPort {
  call(
    network: NetworkDescriptor,
    contract: string,
    method: string,
    params: Array<{ type: string; value: unknown }>,
  ): Promise<{ result: string }>;
  send(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: EvmContractWriteInput,
  ): Promise<TxReceiptView>;
}

export interface TronContractPort {
  call(
    network: NetworkDescriptor,
    contract: string,
    method: string,
    params: TronContractParameter[],
  ): Promise<{ result: string[] }>;
  send(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: GovernanceTransactionInput & {
      contract: string;
      method: string;
      approvalKind?: ApprovalKind;
      parameters: TronContractParameter[];
      callValueSun: Sun;
      feeLimit: Sun;
    },
  ): Promise<TxReceiptView>;
}

export interface AgentContractPorts {
  evm: EvmContractPort;
  tron: TronContractPort;
}
