import type { NetworkDescriptor, UnsignedTx } from "../../../domain/types/index.js";
import { ChainError } from "../../../domain/errors/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import { outcomeData } from "../../services/transaction-mode.js";
import { tronConfirmation } from "../../services/tron-confirmation.js";
import { tronTransactionHooks } from "./multisig-authorization.js";
import {
  governanceTransactionMode,
  transactionResource,
  type GovernanceTransactionInput,
} from "./governance-transaction.js";

/**
 * The Ledger TRON app's parser implements a fixed contract-type allowlist (java's
 * `ledger/wrapper/ContractTypeChecker`), and none of this group's types are on it:
 * `WitnessCreateContract`, `WitnessUpdateContract`, `UpdateBrokerageContract`. The device answers
 * APDU 0x6a80 and no app setting changes that, so refuse before the user is sent to unlock it and
 * before any RPC is spent — the rule established for the asset group in docs/adr/0003.
 *
 * The `proposal` group is deliberately NOT gated: ProposalCreate/Approve/Delete *are* allowlisted.
 */
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
    const gateway = this.gateways.get(network, "tron");
    const mode = governanceTransactionMode(this.pipeline, scope, input, LEDGER_CANNOT_SIGN);
    const owner = scope.resolveAddress("tron");
    const [witness, account, parameters] = await Promise.all([
      gateway.getWitness(owner),
      gateway.getAccount(owner),
      gateway.getChainParameters(),
    ]);
    if (witness)
      throw new ChainError("already_witness", `${owner} is already a registered witness`);
    // "Activated" means the node returned a record carrying an address. Testing for an EMPTY object
    // is not the same thing: a node that answers with a stub (just `address`, no balance) would pass
    // that check and the user would get an opaque node rejection instead of `account_not_active`.
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
    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...mode,
      confirm: tronConfirmation(gateway, scope),
      ...tronTransactionHooks(gateway),
      build: async (address) =>
        gateway.buildWitnessCreate(address, input.url, { permissionId: input.permissionId }),
      estimate: async (_tx: UnsignedTx) => ({
        feeModel: "tron-resource",
        feeSun: registrationFeeSun.toString(),
        note: "irreversible witness registration burn plus bandwidth",
      }),
    });
    return witnessReceipt("witness-create", outcomeData(outcome), owner, {
      url: input.url,
      // The node receipt's `fee` generally covers bandwidth/energy only. Witness registration
      // also burns getAccountUpgradeCost, which is the economically relevant fee for this action.
      feeSun: registrationFeeSun.toString(),
      registrationFeeSun: registrationFeeSun.toString(),
    });
  }

  async update(scope: TransactionScope, network: NetworkDescriptor, input: WitnessUrlInput) {
    const gateway = this.gateways.get(network, "tron");
    const mode = governanceTransactionMode(this.pipeline, scope, input, LEDGER_CANNOT_SIGN);
    const owner = scope.resolveAddress("tron");
    await requireWitness(gateway, owner);
    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...mode,
      confirm: tronConfirmation(gateway, scope),
      ...tronTransactionHooks(gateway),
      build: async (address) =>
        gateway.buildWitnessUpdate(address, input.url, { permissionId: input.permissionId }),
      estimate: bandwidthEstimate,
    });
    return witnessReceipt("witness-update", outcomeData(outcome), owner, { url: input.url });
  }

  async setBrokerage(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: WitnessBrokerageInput,
  ) {
    const gateway = this.gateways.get(network, "tron");
    const mode = governanceTransactionMode(this.pipeline, scope, input, LEDGER_CANNOT_SIGN);
    const owner = scope.resolveAddress("tron");
    await requireWitness(gateway, owner);
    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...mode,
      confirm: tronConfirmation(gateway, scope),
      ...tronTransactionHooks(gateway),
      build: async (address) =>
        gateway.buildWitnessSetBrokerage(address, input.percent, {
          permissionId: input.permissionId,
        }),
      estimate: bandwidthEstimate,
    });
    return witnessReceipt("witness-set-brokerage", outcomeData(outcome), owner, {
      brokerage: input.percent,
    });
  }
}

async function requireWitness(gateway: TronGateway, address: string): Promise<void> {
  if (!(await gateway.getWitness(address))) {
    throw new ChainError("not_a_witness", `${address} is not a registered witness`);
  }
}

async function bandwidthEstimate(_tx: UnsignedTx) {
  return { feeModel: "tron-resource", note: "witness governance uses bandwidth only" };
}

function witnessReceipt(
  kind: "witness-create" | "witness-update" | "witness-set-brokerage",
  data: Record<string, unknown>,
  witnessAddress: string,
  fields: Record<string, unknown>,
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
