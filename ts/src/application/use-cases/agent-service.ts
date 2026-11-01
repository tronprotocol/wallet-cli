import type { ExecutionDeadline } from "../contracts/deadline.js";
import { requestDispatchCheck } from "../services/command-deadline.js";
import { UsageError } from "../../domain/errors/index.js";
import type { NetworkDescriptor, TxReceiptView } from "../../domain/types/index.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type { AgentContractPorts } from "../ports/agent-registry.js";
import type {
  AgentRegistryReader,
  AgentRegistrationLoader,
  AgentRegistryValue,
} from "../ports/agent-sdk.js";
import { resolveAgentId } from "../../domain/erc8004/index.js";
import {
  FAMILIES,
  sameAddress,
  tronAddressFromEvmHex,
  type ChainFamily,
} from "../../domain/family/index.js";
import { type Sun, sunAmount } from "../../domain/amounts/index.js";
import { DEFAULT_FEE_LIMIT_SUN } from "../../domain/fees/tron.js";

interface TransactionOptions {
  dryRun?: boolean;
  signOnly?: boolean;
  buildOnly?: boolean;
  permissionId?: number;
  expiration?: number;
  feeLimit?: Sun;
}

interface AgentCall {
  contract: string;
  method: string;
  params: Array<{ type: string; value: unknown }>;
  approvalKind?: "erc721";
}

interface AgentFamily {
  send(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: TransactionOptions,
    call: AgentCall,
  ): Promise<TxReceiptView>;
  // Registry address reads in the family's canonical form.
  address(value: string): string;
}

export class AgentService {
  // ERC-8004 behavior that differs per chain family.
  private readonly families: Record<ChainFamily, AgentFamily> = {
    evm: { send: (...args) => this.sendEvm(...args), address: (value) => value },
    tron: { send: (...args) => this.sendTron(...args), address: tronAddressFromEvmHex },
  };

  constructor(
    private readonly contracts: AgentContractPorts,
    private readonly registry: AgentRegistryReader,
    private readonly registration: AgentRegistrationLoader,
  ) {}

  async show(deadline: ExecutionDeadline, network: NetworkDescriptor, id: string) {
    const agentId = resolveAgentId(id, network).toString();
    const registry = this.registry.registry(network);
    const [owner, uri, approved] = await Promise.all([
      this.read(deadline, network, registry, "ownerOf(uint256)", [
        { type: "uint256", value: agentId },
      ]),
      this.read(deadline, network, registry, "tokenURI(uint256)", [
        { type: "uint256", value: agentId },
      ]),
      this.read(deadline, network, registry, "getApproved(uint256)", [
        { type: "uint256", value: agentId },
      ]),
    ]);
    const loaded = await this.registration.load(String(uri), requestDispatchCheck(deadline));
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
      const agentId = txId
        ? await this.registry.registeredAgentId(network, txId, requestDispatchCheck(scope.deadline))
        : undefined;
      if (agentId !== undefined) return { ...result, identity: { ...result.identity, agentId } };
    } catch {
      // Preserve the confirmed transaction when receipt enrichment fails.
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
      await this.read(
        scope.deadline,
        network,
        this.registry.registry(network),
        "tokenURI(uint256)",
        [{ type: "uint256", value: id }],
      ),
    );
    const result = await this.write(scope, network, input, "setAgentURI(uint256,string)", [
      { type: "uint256", value: id },
      { type: "string", value: input.uri },
    ]);
    const view = { ...result, identity: { agentId: id, oldURI, requestedURI: input.uri } };
    if (result.stage !== "confirmed") return view;
    try {
      const newURI = String(
        await this.read(
          scope.deadline,
          network,
          this.registry.registry(network),
          "tokenURI(uint256)",
          [{ type: "uint256", value: id }],
        ),
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
    if (sameAddress(network.family, input.newOwner, FAMILIES[network.family].zeroAddress)) {
      throw new UsageError("invalid_address", "Agent owner must not be the zero address");
    }
    const id = resolveAgentId(input.id, network).toString();
    const registry = this.registry.registry(network);
    const owner = String(
      await this.read(scope.deadline, network, registry, "ownerOf(uint256)", [
        { type: "uint256", value: id },
      ]),
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
        await this.read(scope.deadline, network, registry, "ownerOf(uint256)", [
          { type: "uint256", value: id },
        ]),
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
    const operator = input.revoke ? FAMILIES[network.family].zeroAddress : input.operator!;
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

  async operatorCheck(
    deadline: ExecutionDeadline,
    network: NetworkDescriptor,
    owner: string,
    operator: string,
  ) {
    const registry = this.registry.registry(network);
    const approved = await this.read(
      deadline,
      network,
      registry,
      "isApprovedForAll(address,address)",
      [
        { type: "address", value: owner },
        { type: "address", value: operator },
      ],
    );
    return { owner, operator, approved: Boolean(approved), registry };
  }

  private async setOperator(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: TransactionOptions & { operator: string },
    approved: boolean,
  ) {
    const result = await this.write(scope, network, input, "setApprovalForAll(address,bool)", [
      { type: "address", value: input.operator },
      { type: "bool", value: approved },
    ]);
    const view = { ...result, identity: { operator: input.operator, requestedApproval: approved } };
    if (result.stage !== "confirmed") return view;
    try {
      const current = await this.operatorCheck(
        scope.deadline,
        network,
        scope.resolveAddress(network.family),
        input.operator,
      );
      return { ...view, identity: { ...view.identity, approved: current.approved } };
    } catch {
      scope.warn(
        "Operator update confirmed, but its current approval could not be read; do not resubmit the transaction.",
      );
      return view;
    }
  }

  private async read(
    deadline: ExecutionDeadline,
    network: NetworkDescriptor,
    _registry: string,
    method: string,
    params: Array<{ type: string; value: unknown }>,
  ): Promise<AgentRegistryValue> {
    return this.registry.read(deadline, network, method, params);
  }

  private write(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: TransactionOptions,
    method: string,
    params: Array<{ type: string; value: unknown }>,
  ) {
    return this.families[network.family].send(scope, network, input, {
      contract: this.registry.registry(network),
      method,
      params,
      ...(method === "approve(address,uint256)" ? { approvalKind: "erc721" as const } : {}),
    });
  }

  private sendEvm(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: TransactionOptions,
    { contract, method, params, approvalKind }: AgentCall,
  ) {
    return this.contracts.evm.send(scope, network, {
      ...input,
      ...(approvalKind ? { approvalKind } : {}),
      contract,
      method,
      params,
    });
  }

  private sendTron(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: TransactionOptions,
    { contract, method, params, approvalKind }: AgentCall,
  ) {
    return this.contracts.tron.send(scope, network, {
      ...input,
      ...(approvalKind ? { approvalKind } : {}),
      contract,
      method,
      parameters: params,
      callValueSun: sunAmount("0"),
      feeLimit: input.feeLimit ?? DEFAULT_FEE_LIMIT_SUN,
    });
  }

  private address(network: NetworkDescriptor, value: string): string {
    return this.families[network.family].address(value);
  }
}
