import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronContractParameter, TronGateway } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import { ChainError } from "../../../domain/errors/index.js";
import { computeTronCreate2Address } from "../../../domain/governance/create2.js";
import type { UnsignedTx } from "../../../domain/types/index.js";
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
import { tronConfirmation } from "../../services/tron-confirmation.js";
import { tronHexToBase58 } from "../../../domain/address/index.js";
import { fromBaseUnits } from "../../../domain/amounts/index.js";
import { approveRows } from "../../services/approve-receipt.js";
import { tronTransactionHooks } from "./multisig-authorization.js";

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
      result: await this.gateways
        .get(network, "tron")
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
    if (transactionRequiresSigner(input)) this.pipeline.assertCanSign(scope.activeAccount, "tron");
    const gateway = this.gateways.get(network, "tron");
    // Resolved BEFORE the run so `--dry-run` carries it too: the allowance is the one thing a dry
    // run of an approve exists to confirm. TRC20 shares the method and the hazard with ERC-20, so
    // it shares the receipt (§7.2).
    const approval = await approveRows({
      method: input.method,
      params: input.parameters,
      metadata: () =>
        gateway.getTokenInfo(input.contract).then((info) => ({
          decimals: info.decimals ?? info.precision,
          symbol: typeof info.symbol === "string" ? info.symbol : undefined,
        })),
      // A TRON address may arrive as 41-hex from a caller pasting what a node returned.
      displayAddress: tronHexToBase58,
      fromBaseUnits,
    });
    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      ...tronTransactionHooks(gateway),
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
      feeLimit: string;
      parameters: unknown[];
    },
  ) {
    // Ledger TRON app firmware cannot sign a CreateSmartContract tx — reject before any device I/O.
    if (transactionRequiresSigner(input)) {
      this.pipeline.assertCanSign(scope.activeAccount, "tron", { requireSoftware: true });
    }
    const gateway = this.gateways.get(network, "tron");
    const hooks = tronTransactionHooks(gateway);
    let contractAddress: string | undefined;
    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      ...hooks,
      // TRON derives the deployed address from the final txID, and `prepare` recomputes that txID
      // when it binds --permission-id / --expiration. Read the address from the prepared
      // transaction, never from the builder output, or we report a contract nobody deploys.
      prepare: (transaction, options) => {
        const prepared = hooks.prepare(transaction, options);
        const hex = (prepared as { contract_address?: string }).contract_address;
        contractAddress = hex ? tronHexToBase58(hex) : undefined;
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
    return this.govern(
      scope,
      network,
      input,
      "contract-set-user-resource-percent",
      (gateway, owner) =>
        gateway.buildUpdateUserResourcePercent(owner, input.address, input.percent, {
          permissionId: input.permissionId,
        }),
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
    build: (gateway: TronGateway, owner: string) => Promise<UnsignedTx>,
    fields: Record<string, unknown>,
  ) {
    const gateway = this.gateways.get(network, "tron");
    // ClearABIContract / UpdateEnergyLimitContract / UpdateSettingContract are all absent from the
    // Ledger TRON app's contract-type allowlist, so the device cannot parse any of them (APDU
    // 0x6a80). Refuse before the unlock prompt and before any RPC — docs/adr/0003. `send` above is
    // deliberately ungated: TriggerSmartContract IS allowlisted.
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
    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...mode,
      confirm: tronConfirmation(gateway, scope),
      ...tronTransactionHooks(gateway),
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
  feeLimit: string,
  estimate: Record<string, unknown>,
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
  if (typeof value !== "string") return undefined;
  const latest = value.split(",").at(-1)?.split(":");
  return latest?.length === 2 ? positiveInteger(latest[1]) : undefined;
}
