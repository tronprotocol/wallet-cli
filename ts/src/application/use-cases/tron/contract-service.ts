import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronContractParameter } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import { outcomeData } from "../../services/transaction-mode.js";
import { tronConfirmation } from "../../services/tron-confirmation.js";
import { tronHexToBase58 } from "../../../domain/address/index.js";
import { ChainError } from "../../../domain/errors/index.js";
import { computeTronCreate2Address } from "../../../domain/governance/create2.js";
import type { UnsignedTx } from "../../../domain/types/index.js";
import {
  governanceTransactionMode,
  transactionResource,
  withExtendedExpiration,
  type GovernanceTransactionInput,
} from "./governance-transaction.js";

export class TronContractService {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly pipeline: TxPipeline,
  ) {}

  async call(
    network: NetworkDescriptor,
    contract: string,
    method: string,
    parameters: TronContractParameter[],
  ) {
    return {
      contract,
      method,
      result: await this.gateways.get(network, "tron")
        .triggerConstantContract(contract, method, parameters),
    };
  }

  async send(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: GovernanceTransactionInput & {
      contract: string;
      method: string;
      parameters: TronContractParameter[];
      callValueSun: string;
      feeLimit: string;
    },
  ) {
    const gateway = this.gateways.get(network, "tron");
    const mode = governanceTransactionMode(this.pipeline, scope, input);
    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...mode,
      confirm: tronConfirmation(gateway, scope),
      build: async (from) => withExtendedExpiration(
        gateway,
        await gateway.triggerSmartContract(
          from,
          input.contract,
          input.method,
          input.parameters,
          { feeLimit: input.feeLimit, callValue: input.callValueSun, permissionId: input.permissionId },
        ),
        input.expiration,
      ),
      estimate: () => gateway.estimateResources(
        scope.resolveAddress("tron"),
        input.contract,
        input.method,
        input.parameters,
      ),
    });
    return {
      kind: "contract-send" as const,
      ...outcomeData(outcome),
      method: input.method,
      contract: input.contract,
    };
  }

  async deploy(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: GovernanceTransactionInput & {
      abi: unknown;
      bytecode: string;
      feeLimit: string;
      parameters: unknown[];
    },
  ) {
    const gateway = this.gateways.get(network, "tron");
    // Ledger TRON app firmware cannot sign a CreateSmartContract tx — reject before any device I/O.
    const mode = governanceTransactionMode(this.pipeline, scope, input, { requireSoftware: true });
    let contractAddress: string | undefined;
    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...mode,
      confirm: tronConfirmation(gateway, scope),
      build: async (from) => {
        const built = await gateway.deployContract(from, input);
        const hex = (built as { contract_address?: string }).contract_address;
        if (hex) contractAddress = tronHexToBase58(hex);
        return withExtendedExpiration(gateway, built, input.expiration);
      },
      estimate: async () => ({
        feeModel: "tron-resource",
        note: "deploy energy depends on bytecode size",
      }),
    });
    return { kind: "contract-deploy" as const, contractAddress, ...outcomeData(outcome) };
  }

  async info(network: NetworkDescriptor, address: string) {
    const metadata = await this.gateways.get(network, "tron").getContractMetadata(address);
    return {
      address,
      name: metadata.name,
      functionCount: metadata.methods.length,
      methods: metadata.methods,
      contract: metadata.contract,
      info: metadata.info,
    };
  }

  async clearAbi(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: GovernanceTransactionInput & { address: string },
  ) {
    return this.govern(
      scope,
      network,
      input,
      "contract-clear-abi",
      (gateway, owner) => gateway.buildClearContractAbi(
        owner,
        input.address,
        { permissionId: input.permissionId },
      ),
      {},
    );
  }

  async setOriginEnergyLimit(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: GovernanceTransactionInput & { address: string; energy: number | string },
  ) {
    return this.govern(
      scope,
      network,
      input,
      "contract-set-origin-energy-limit",
      (gateway, owner) => gateway.buildUpdateOriginEnergyLimit(
        owner,
        input.address,
        input.energy,
        { permissionId: input.permissionId },
      ),
      { originEnergyLimit: exactIntegerView(input.energy) },
    );
  }

  async setUserResourcePercent(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: GovernanceTransactionInput & { address: string; percent: number },
  ) {
    return this.govern(
      scope,
      network,
      input,
      "contract-set-user-resource-percent",
      (gateway, owner) => gateway.buildUpdateUserResourcePercent(
        owner,
        input.address,
        input.percent,
        { permissionId: input.permissionId },
      ),
      { consumeUserResourcePercent: input.percent },
    );
  }

  create2(deployer: string, code: string, salt: string) {
    return computeTronCreate2Address(deployer, code, salt);
  }

  private async govern(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: GovernanceTransactionInput & { address: string },
    kind:
      | "contract-clear-abi"
      | "contract-set-origin-energy-limit"
      | "contract-set-user-resource-percent",
    build: (gateway: ReturnType<ChainGatewayProvider["get"]>, owner: string) => Promise<UnsignedTx>,
    fields: Record<string, unknown>,
  ) {
    const gateway = this.gateways.get(network, "tron");
    const mode = governanceTransactionMode(this.pipeline, scope, input);
    const owner = scope.resolveAddress("tron");
    let metadata;
    try {
      metadata = await gateway.getContractMetadata(input.address);
    } catch (error) {
      if (error instanceof ChainError && error.code === "not_found") {
        throw new ChainError("contract_not_found", `no contract deployed at ${input.address}`);
      }
      throw error;
    }
    if (!metadata.originAddress || metadata.originAddress !== owner) {
      throw new ChainError(
        "not_contract_deployer",
        `only contract deployer ${metadata.originAddress ?? "(unknown)"} may govern ${input.address}`,
      );
    }
    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...mode,
      confirm: tronConfirmation(gateway, scope),
      build: async (address) => withExtendedExpiration(
        gateway,
        await build(gateway, address),
        input.expiration,
      ),
      estimate: async (_tx: UnsignedTx) => ({ feeModel: "tron-resource", note: "contract governance uses bandwidth only" }),
    });
    const data = outcomeData(outcome);
    const resource = transactionResource(data);
    return {
      kind,
      ...data,
      contractAddress: input.address,
      deployerAddress: owner,
      ...fields,
      ...(resource ? { resource } : {}),
    };
  }
}

function exactIntegerView(value: number | string): number | string {
  const parsed = BigInt(value);
  return parsed <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(parsed) : parsed.toString();
}
