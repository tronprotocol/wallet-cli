import type { NetworkDescriptor, TxReceiptView } from "../../../../plugin-api/domain.js";
import type { ExecutionDeadline } from "../../../../plugin-api/application.js";
import type { TransactionScope } from "../../../../plugin-api/application.js";
import type {
  EvmContractWriteInput,
  ApprovalKind,
  GovernanceTransactionInput,
} from "../../../../plugin-api/application.js";
import type { TronContractParameter } from "../../../../plugin-api/application.js";
import type { Sun } from "../../../../plugin-api/domain.js";

export interface EvmContractPort {
  call(
    deadline: ExecutionDeadline,
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
    deadline: ExecutionDeadline,
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
