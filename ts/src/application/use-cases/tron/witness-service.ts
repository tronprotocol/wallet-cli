import { requestDispatchCheck } from "../../services/command-deadline.js";
import type { NetworkDescriptor, UnsignedTx } from "../../../domain/types/index.js";
import { percent, witnessUrl } from "../../../domain/tron/governance/limits.js";
import { sunAmount } from "../../../domain/amounts/index.js";
import { ChainError } from "../../../domain/errors/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import { outcomeData, type TxOutcomeView } from "../../services/transaction-mode.js";
import { tronConfirmation } from "../../services/tron/tron-confirmation.js";
import { tronTransactionHooks } from "./multisig-authorization.js";
import {
  governanceTransactionMode,
  transactionResource,
  type GovernanceTransactionInput,
} from "./governance-transaction.js";

// Ledger cannot sign WitnessCreateContract, WitnessUpdateContract, or UpdateBrokerageContract.
const LEDGER_CANNOT_SIGN = { requireSoftware: true } as const;

export interface WitnessUrlInput extends GovernanceTransactionInput {
  url: string;
}

export interface WitnessBrokerageInput extends GovernanceTransactionInput {
  percent: number;
}

export class TronWitnessService {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly pipeline: TxPipeline,
  ) {}

  async create(scope: TransactionScope, network: NetworkDescriptor, input: WitnessUrlInput) {
    const url = witnessUrl(input.url);
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline));
    const mode = governanceTransactionMode(this.pipeline, scope, input, LEDGER_CANNOT_SIGN);
    const owner = scope.resolveAddress("tron");
    const [witness, account, parameters] = await Promise.all([
      gateway.getWitness(owner),
      gateway.getAccount(owner),
      gateway.getChainParameters(),
    ]);
    if (witness)
      throw new ChainError("already_witness", `${owner} is already a registered witness`);
    if (!account.address) {
      throw new ChainError("account_not_active", `${owner} is not activated on-chain`);
    }
    const feeValue = parameters.find((entry) => entry.key === "getAccountUpgradeCost")?.value;
    if (feeValue === undefined || !/^\d+$/.test(String(feeValue))) {
      throw new ChainError("chain_parameter_unavailable", "getAccountUpgradeCost is unavailable");
    }
    const registrationFeeSun = BigInt(String(feeValue));
    if (BigInt(account.balance ?? "0") < registrationFeeSun) {
      throw new ChainError(
        "insufficient_balance",
        `witness registration requires ${registrationFeeSun} SUN but the account balance is ${account.balance ?? "0"} SUN`,
      );
    }
    const outcome = await this.pipeline.runTron({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...mode,
      confirm: tronConfirmation(gateway, scope),
      ...tronTransactionHooks(gateway),
      preflight: null,
      build: async (address) =>
        gateway.buildWitnessCreate(address, url, { permissionId: input.permissionId }),
      estimate: async (_tx: UnsignedTx) => ({
        feeModel: "tron-resource",
        feeSun: sunAmount(registrationFeeSun),
        note: "irreversible witness registration burn plus bandwidth",
      }),
    });
    return witnessReceipt("witness-create", outcomeData(outcome), owner, {
      url,
      // Registration burns getAccountUpgradeCost in addition to receipt resource fees.
      feeSun: registrationFeeSun.toString(),
      registrationFeeSun: registrationFeeSun.toString(),
    });
  }

  async update(scope: TransactionScope, network: NetworkDescriptor, input: WitnessUrlInput) {
    const url = witnessUrl(input.url);
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline));
    const mode = governanceTransactionMode(this.pipeline, scope, input, LEDGER_CANNOT_SIGN);
    const owner = scope.resolveAddress("tron");
    await requireWitness(gateway, owner);
    const outcome = await this.pipeline.runTron({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...mode,
      confirm: tronConfirmation(gateway, scope),
      ...tronTransactionHooks(gateway),
      preflight: null,
      build: async (address) =>
        gateway.buildWitnessUpdate(address, url, { permissionId: input.permissionId }),
      estimate: bandwidthEstimate,
    });
    return witnessReceipt("witness-update", outcomeData(outcome), owner, { url });
  }

  async setBrokerage(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: WitnessBrokerageInput,
  ) {
    const brokerage = percent(input.percent, "brokerage");
    const gateway = this.gateways.get(network, "tron", requestDispatchCheck(scope.deadline));
    const mode = governanceTransactionMode(this.pipeline, scope, input, LEDGER_CANNOT_SIGN);
    const owner = scope.resolveAddress("tron");
    await requireWitness(gateway, owner);
    const outcome = await this.pipeline.runTron({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...mode,
      confirm: tronConfirmation(gateway, scope),
      ...tronTransactionHooks(gateway),
      preflight: null,
      build: async (address) =>
        gateway.buildWitnessSetBrokerage(address, brokerage, {
          permissionId: input.permissionId,
        }),
      estimate: bandwidthEstimate,
    });
    return witnessReceipt("witness-set-brokerage", outcomeData(outcome), owner, {
      brokerage,
    });
  }
}

async function requireWitness(gateway: TronGateway, address: string): Promise<void> {
  if (!(await gateway.getWitness(address))) {
    throw new ChainError("not_a_witness", `${address} is not a registered witness`);
  }
}

type WitnessReceiptKind = "witness-create" | "witness-update" | "witness-set-brokerage";

async function bandwidthEstimate(_tx: UnsignedTx) {
  return { feeModel: "tron-resource" as const, note: "witness governance uses bandwidth only" };
}

function witnessReceipt<K extends WitnessReceiptKind, F extends object>(
  kind: K,
  data: TxOutcomeView,
  witnessAddress: string,
  fields: F,
) {
  const resource = transactionResource(data);
  return {
    kind,
    ...data,
    witnessAddress,
    ...fields,
    ...(resource ? { resource } : {}),
  };
}
