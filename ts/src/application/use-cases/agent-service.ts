import type { NetworkDescriptor } from "../../domain/types/index.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type { AgentContractPorts } from "../ports/agent-registry.js";
import type { AgentRegistryReader, AgentRegistrationLoader } from "../ports/agent-sdk.js";
import { resolveAgentId } from "../../domain/erc8004/index.js";
import { tronHexToBase58 } from "../../domain/address/index.js";

interface TransactionOptions {
  dryRun?: boolean;
  signOnly?: boolean;
  buildOnly?: boolean;
  permissionId?: number;
  expiration?: number;
  feeLimit?: string;
}

export class AgentService {
  constructor(
    private readonly contracts: AgentContractPorts,
    private readonly registry: AgentRegistryReader,
    private readonly registration: AgentRegistrationLoader,
  ) {}

  async show(network: NetworkDescriptor, id: string) {
    const agentId = resolveAgentId(id, network).toString();
    const registry = this.registry.registry(network);
    const [owner, uri, approved] = await Promise.all([
      this.read(network, registry, "ownerOf(uint256)", [{ type: "uint256", value: agentId }]),
      this.read(network, registry, "tokenURI(uint256)", [{ type: "uint256", value: agentId }]),
      this.read(network, registry, "getApproved(uint256)", [{ type: "uint256", value: agentId }]),
    ]);
    const loaded = await this.registration.load(String(uri));
    return {
      agentId,
      owner: this.address(network, String(owner)),
      uri: String(uri),
      approved: this.address(network, String(approved)),
      registry,
      ...(loaded.metadata ? { metadata: loaded.metadata } : {}),
      ...(loaded.warning ? { warnings: [loaded.warning] } : {}),
    };
  }

  async register(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: TransactionOptions & { uri: string },
  ) {
    const result: Record<string, unknown> & { identity: { uri: string } } = {
      ...(await this.write(scope, network, input, "register(string)", [
        { type: "string", value: input.uri },
      ])),
      identity: { uri: input.uri },
    };
    if (result.stage !== "confirmed") return result;
    const txId = String(result.txId ?? result.hash ?? "");
    try {
      const agentId = txId ? await this.registry.registeredAgentId(network, txId) : undefined;
      if (agentId !== undefined) return { ...result, identity: { ...result.identity, agentId } };
    } catch {
      /* Keep the confirmed transaction even when receipt enrichment fails. */
    }
    scope.warn(
      "Registration confirmed, but the minted Agent ID could not be read; do not resubmit the transaction.",
    );
    return result;
  }

  async update(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: TransactionOptions & { id: string; uri: string },
  ) {
    const id = resolveAgentId(input.id, network).toString();
    const oldURI = String(
      await this.read(network, this.registry.registry(network), "tokenURI(uint256)", [
        { type: "uint256", value: id },
      ]),
    );
    const result = await this.write(scope, network, input, "setAgentURI(uint256,string)", [
      { type: "uint256", value: id },
      { type: "string", value: input.uri },
    ]);
    const view = { ...result, identity: { agentId: id, oldURI, requestedURI: input.uri } };
    if (result.stage !== "confirmed") return view;
    try {
      const newURI = String(
        await this.read(network, this.registry.registry(network), "tokenURI(uint256)", [
          { type: "uint256", value: id },
        ]),
      );
      return { ...view, identity: { ...view.identity, newURI } };
    } catch {
      scope.warn("URI update confirmed, but the current Agent URI could not be read.");
      return view;
    }
  }

  async transfer(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: TransactionOptions & { id: string; newOwner: string },
  ) {
    const id = resolveAgentId(input.id, network).toString();
    const registry = this.registry.registry(network);
    const owner = String(
      await this.read(network, registry, "ownerOf(uint256)", [{ type: "uint256", value: id }]),
    );
    const result = await this.write(
      scope,
      network,
      input,
      "transferFrom(address,address,uint256)",
      [
        { type: "address", value: this.address(network, owner) },
        { type: "address", value: input.newOwner },
        { type: "uint256", value: id },
      ],
    );
    const view = {
      ...result,
      identity: {
        agentId: id,
        oldOwner: this.address(network, owner),
        requestedOwner: input.newOwner,
      },
    };
    if (result.stage !== "confirmed") return view;
    try {
      const newOwner = String(
        await this.read(network, registry, "ownerOf(uint256)", [{ type: "uint256", value: id }]),
      );
      return { ...view, identity: { ...view.identity, newOwner: this.address(network, newOwner) } };
    } catch {
      scope.warn("Transfer confirmed, but the current Agent owner could not be read.");
      return view;
    }
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
    const registry = this.registry.registry(network);
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
    _registry: string,
    method: string,
    params: Array<{ type: string; value: unknown }>,
  ): Promise<unknown> {
    // Registry selection and ABI decoding are supplied by the published SDK adapter.
    return this.registry.read(network, method, params);
  }

  private write(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: TransactionOptions,
    method: string,
    params: Array<{ type: string; value: unknown }>,
  ) {
    const contract = this.registry.registry(network);
    if (network.family === "evm") {
      return this.contracts.evm.send(scope, network, {
        ...input,
        ...(method === "approve(address,uint256)" ? { approvalKind: "erc721" as const } : {}),
        contract,
        method,
        params,
      });
    }
    return this.contracts.tron.send(scope, network, {
      ...input,
      ...(method === "approve(address,uint256)" ? { approvalKind: "erc721" as const } : {}),
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
