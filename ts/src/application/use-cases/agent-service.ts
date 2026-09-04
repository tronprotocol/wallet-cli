import { Interface } from "ethers";
import type { NetworkDescriptor } from "../../domain/types/index.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type { AgentContractPorts } from "../ports/agent-registry.js";
import { identityRegistryFor, resolveAgentId } from "../../domain/erc8004/index.js";
import { tronHexToBase58 } from "../../domain/address/index.js";

const IDENTITY = new Interface([
  "function ownerOf(uint256 agentId) view returns (address)",
  "function tokenURI(uint256 agentId) view returns (string)",
  "function getApproved(uint256 agentId) view returns (address)",
  "function isApprovedForAll(address owner,address operator) view returns (bool)",
]);

interface TransactionOptions {
  dryRun?: boolean;
  signOnly?: boolean;
  buildOnly?: boolean;
  permissionId?: number;
  expiration?: number;
  feeLimit?: string;
}

export class AgentService {
  constructor(private readonly contracts: AgentContractPorts) {}

  async show(network: NetworkDescriptor, id: string) {
    const agentId = resolveAgentId(id, network).toString();
    const registry = identityRegistryFor(network);
    const [owner, uri, approved] = await Promise.all([
      this.read(network, registry, "ownerOf(uint256)", [{ type: "uint256", value: agentId }]),
      this.read(network, registry, "tokenURI(uint256)", [{ type: "uint256", value: agentId }]),
      this.read(network, registry, "getApproved(uint256)", [{ type: "uint256", value: agentId }]),
    ]);
    return {
      agentId,
      owner: this.address(network, String(owner)),
      uri: String(uri),
      approved: this.address(network, String(approved)),
      registry,
    };
  }

  register(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: TransactionOptions & { uri: string },
  ) {
    return this.write(scope, network, input, "register(string)", [
      { type: "string", value: input.uri },
    ]);
  }

  update(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: TransactionOptions & { id: string; uri: string },
  ) {
    const id = resolveAgentId(input.id, network).toString();
    return this.write(scope, network, input, "setAgentURI(uint256,string)", [
      { type: "uint256", value: id },
      { type: "string", value: input.uri },
    ]);
  }

  async transfer(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: TransactionOptions & { id: string; newOwner: string },
  ) {
    const id = resolveAgentId(input.id, network).toString();
    const registry = identityRegistryFor(network);
    const owner = String(
      await this.read(network, registry, "ownerOf(uint256)", [{ type: "uint256", value: id }]),
    );
    return this.write(scope, network, input, "transferFrom(address,address,uint256)", [
      { type: "address", value: this.address(network, owner) },
      { type: "address", value: input.newOwner },
      { type: "uint256", value: id },
    ]);
  }

  approve(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: TransactionOptions & { id: string; operator?: string; revoke?: boolean },
  ) {
    const operator = input.revoke ? zeroAddress(network) : input.operator!;
    return this.write(scope, network, input, "approve(address,uint256)", [
      { type: "address", value: operator },
      { type: "uint256", value: resolveAgentId(input.id, network).toString() },
    ]);
  }

  operatorAdd(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: TransactionOptions & { operator: string },
  ) {
    return this.setOperator(scope, network, input, true);
  }

  operatorRemove(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: TransactionOptions & { operator: string },
  ) {
    return this.setOperator(scope, network, input, false);
  }

  async operatorCheck(network: NetworkDescriptor, owner: string, operator: string) {
    const registry = identityRegistryFor(network);
    const approved = await this.read(network, registry, "isApprovedForAll(address,address)", [
      { type: "address", value: owner },
      { type: "address", value: operator },
    ]);
    return { owner, operator, approved: Boolean(approved), registry };
  }

  private setOperator(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: TransactionOptions & { operator: string },
    approved: boolean,
  ) {
    return this.write(scope, network, input, "setApprovalForAll(address,bool)", [
      { type: "address", value: input.operator },
      { type: "bool", value: approved },
    ]);
  }

  private async read(
    network: NetworkDescriptor,
    registry: string,
    method: string,
    params: Array<{ type: string; value: unknown }>,
  ): Promise<unknown> {
    const response = await this.contracts[network.family].call(network, registry, method, params);
    const raw = network.family === "tron" ? response.result[0] : response.result;
    const data = String(raw ?? "");
    const [decoded] = IDENTITY.decodeFunctionResult(
      method,
      data.startsWith("0x") ? data : `0x${data}`,
    );
    return decoded;
  }

  private write(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: TransactionOptions,
    method: string,
    params: Array<{ type: string; value: unknown }>,
  ) {
    const contract = identityRegistryFor(network);
    if (network.family === "evm") {
      return this.contracts.evm.send(scope, network, {
        ...input,
        contract,
        method,
        params,
      });
    }
    return this.contracts.tron.send(scope, network, {
      ...input,
      contract,
      method,
      parameters: params,
      callValueSun: "0",
      feeLimit: input.feeLimit ?? "100000000",
    });
  }

  private address(network: NetworkDescriptor, value: string): string {
    if (network.family !== "tron" || !/^0x[0-9a-fA-F]{40}$/.test(value)) return value;
    return tronHexToBase58(`41${value.slice(2)}`);
  }
}

function zeroAddress(network: NetworkDescriptor): string {
  return network.family === "tron"
    ? "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"
    : "0x0000000000000000000000000000000000000000";
}
