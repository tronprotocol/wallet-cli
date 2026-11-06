import { requestDispatchCheck } from "../../services/command-deadline.js";
import { systemWallClock, type WallClock } from "../../contracts/wall-clock.js";
import type { ExecutionDeadline } from "../../contracts/deadline.js";
import { currentTronEnergyPrice } from "../../../domain/tron/tron-energy-price.js";
import {
  isOriginEnergyLimit,
  MAX_ORIGIN_ENERGY_LIMIT,
  percent,
} from "../../../domain/tron/governance/limits.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type {
  TronContractParameter,
  TronFeeEstimate,
  TronGateway,
} from "../../ports/chain/tron/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import { ChainError, UsageError } from "../../../domain/errors/index.js";
import { computeTronCreate2Address } from "../../../domain/tron/governance/create2.js";
import type {
  NetworkDescriptor,
  TronTransactionArtifact,
  UnsignedTx,
} from "../../../domain/types/index.js";
import {
  governanceTransactionMode,
  transactionResource,
  type GovernanceTransactionInput,
} from "./governance-transaction.js";
import {
  outcomeData,
  transactionMode,
  transactionRequiresSigner,
} from "../../services/transaction-mode.js";
import { tronConfirmation } from "../../services/tron/tron-confirmation.js";
import { tronHexToBase58 } from "../../../domain/address/index.js";
import { fromBaseUnits, type Sun } from "../../../domain/amounts/index.js";
import { approveRows, type ApprovalKind } from "../../services/approve-receipt.js";
import { tronTransactionHooks } from "./multisig-authorization.js";

export class TronContractService {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly pipeline: TxPipeline,
    private readonly now: WallClock = systemWallClock,
  ) {}

  async call(
    deadline: ExecutionDeadline,
    network: NetworkDescriptor,
    contract: string,
    method: string,
    parameters: TronContractParameter[],
  ) {
    return {
      contract,
      method,
      result: await this.gateways
        .get(network, "tron", requestDispatchCheck(deadline))
        .triggerConstantContract(contract, method, parameters),
    };
  }

  async send(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: GovernanceTransactionInput & {
      contract: string;
      method: string;
      // Distinguishes token allowances from NFT approvals with the same signature.
      approvalKind?: ApprovalKind;
      parameters: TronContractParameter[];
      callValueSun: Sun;
      feeLimit: Sun;
    },
  ) {
    if (transactionRequiresSigner(input)) this.pipeline.assertCanSign(scope.activeAccount, "tron");
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline));
    // Resolve approval details before the pipeline so dry runs include the allowance.
    const approval = await approveRows({
      method: input.method,
      params: input.parameters,
      approvalKind: input.approvalKind,
      metadata: () =>
        gateway.getTokenInfo(input.contract).then((info) => ({
          decimals: info.decimals ?? info.precision,
          symbol: info.symbol,
        })),
      // Node addresses may use 41-prefixed hex.
      displayAddress: tronHexToBase58,
      fromBaseUnits,
    });
    const outcome = await this.pipeline.runTron({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      ...tronTransactionHooks(gateway, this.now),
      preflight: null,
      confirm: tronConfirmation(gateway, scope),
      build: async (from) =>
        gateway.triggerSmartContract(from, input.contract, input.method, input.parameters, {
          feeLimit: input.feeLimit,
          callValue: input.callValueSun,
          permissionId: input.permissionId,
        }),
      estimate: async () => {
        const estimate = await gateway.estimateResources(
          scope.resolveAddress("tron"),
          input.contract,
          input.method,
          input.parameters,
          input.callValueSun,
        );
        warnIfFeeLimitLikelyInsufficient(scope, input.feeLimit, estimate);
        return estimate;
      },
    });
    return {
      kind: "contract-send" as const,
      ...outcomeData(outcome),
      ...approval,
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
      feeLimit: Sun;
      parameters: unknown[];
    },
  ) {
    // Ledger cannot sign CreateSmartContract; reject before device I/O.
    if (transactionRequiresSigner(input)) {
      this.pipeline.assertCanSign(scope.activeAccount, "tron", { requireSoftware: true });
    }
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline));
    const hooks = tronTransactionHooks(gateway, this.now);
    let contractAddress: string | undefined;
    const outcome = await this.pipeline.runTron({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      ...hooks,
      preflight: null,
      // Preparation changes txID and therefore the deployed address.
      prepare: (transaction, options) => {
        const prepared = hooks.prepare(transaction, options);
        contractAddress = gateway.deployedContractAddress(prepared);
        return prepared;
      },
      signerOptions: { requireSoftware: true },
      confirm: tronConfirmation(gateway, scope),
      build: (from) => gateway.deployContract(from, input),
      estimate: async () => ({
        feeModel: "tron-resource",
        note: "deploy energy depends on bytecode size",
      }),
    });
    return { kind: "contract-deploy" as const, contractAddress, ...outcomeData(outcome) };
  }

  async info(deadline: ExecutionDeadline, network: NetworkDescriptor, address: string) {
    const metadata = await this.gateways
      .get(network, "tron", requestDispatchCheck(deadline))
      .getContractMetadata(address);
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
      (gateway, owner) =>
        gateway.buildClearContractAbi(owner, input.address, { permissionId: input.permissionId }),
      {},
    );
  }

  async setOriginEnergyLimit(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: GovernanceTransactionInput & { address: string; energy: number | string },
  ) {
    if (!isOriginEnergyLimit(input.energy)) {
      throw new UsageError(
        "invalid_value",
        `origin energy limit must be an integer from 1 to ${MAX_ORIGIN_ENERGY_LIMIT}`,
      );
    }
    return this.govern(
      scope,
      network,
      input,
      "contract-set-origin-energy-limit",
      (gateway, owner) =>
        gateway.buildUpdateOriginEnergyLimit(owner, input.address, input.energy, {
          permissionId: input.permissionId,
        }),
      { originEnergyLimit: exactIntegerView(input.energy) },
    );
  }

  async setUserResourcePercent(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: GovernanceTransactionInput & { address: string; percent: number },
  ) {
    const userPercent = percent(input.percent, "user resource percent");
    return this.govern(
      scope,
      network,
      input,
      "contract-set-user-resource-percent",
      (gateway, owner) =>
        gateway.buildUpdateUserResourcePercent(owner, input.address, userPercent, {
          permissionId: input.permissionId,
        }),
      { consumeUserResourcePercent: userPercent },
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
    build: (gateway: TronGateway, owner: string) => Promise<TronTransactionArtifact>,
    fields: Record<string, unknown>,
  ) {
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline));
    // Ledger cannot sign ClearABIContract, UpdateEnergyLimitContract, or UpdateSettingContract.
    const mode = governanceTransactionMode(this.pipeline, scope, input, { requireSoftware: true });
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
    const outcome = await this.pipeline.runTron({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...mode,
      confirm: tronConfirmation(gateway, scope),
      ...tronTransactionHooks(gateway, this.now),
      preflight: null,
      build: async (address) => await build(gateway, address),
      estimate: async (_tx: UnsignedTx) => ({
        feeModel: "tron-resource",
        note: "contract governance uses bandwidth only",
      }),
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

function warnIfFeeLimitLikelyInsufficient(
  scope: TransactionScope,
  feeLimit: Sun,
  estimate: TronFeeEstimate,
): void {
  const energy = positiveInteger(estimate.energy);
  const energyPriceSun = currentEnergyPrice(estimate.energyPriceSun);
  if (energy === undefined || energyPriceSun === undefined) return;

  const recommendedCapSun = energy * energyPriceSun;
  if (BigInt(feeLimit) >= recommendedCapSun) return;

  scope.warn(
    `fee limit ${feeLimit} SUN is likely insufficient for the estimate of ` +
      `${energy} energy at ${energyPriceSun} SUN/energy ` +
      `(recommended cap ~${recommendedCapSun} SUN); staked/delegated energy and ` +
      "contract energy sharing may change the actual TRX burned",
  );
}

function positiveInteger(value: unknown): bigint | undefined {
  const text =
    typeof value === "bigint"
      ? value.toString()
      : typeof value === "number" && Number.isSafeInteger(value)
        ? String(value)
        : typeof value === "string"
          ? value
          : "";
  return /^[1-9]\d*$/.test(text) ? BigInt(text) : undefined;
}

function currentEnergyPrice(value: unknown): bigint | undefined {
  const price = currentTronEnergyPrice(value);
  return price === undefined ? undefined : BigInt(price);
}
