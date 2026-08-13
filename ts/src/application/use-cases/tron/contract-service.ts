import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronContractParameter } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import {
  outcomeData,
  transactionMode,
  transactionRequiresSigner,
  type TransactionModeInput,
} from "../../services/transaction-mode.js";
import { tronConfirmation } from "../../services/tron-confirmation.js";
import { tronHexToBase58 } from "../../../domain/address/index.js";
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
      result: await this.gateways.get(network, "tron")
        .triggerConstantContract(contract, method, parameters),
    };
  }

  async send(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: TransactionModeInput & {
      contract: string;
      method: string;
      parameters: TronContractParameter[];
      callValueSun: string;
      feeLimit: string;
    },
  ) {
    if (transactionRequiresSigner(input)) this.pipeline.assertCanSign(scope.activeAccount, "tron");
    const gateway = this.gateways.get(network, "tron");
    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      ...tronTransactionHooks(gateway),
      confirm: tronConfirmation(gateway, scope),
      build: (from) => gateway.triggerSmartContract(
        from,
        input.contract,
        input.method,
        input.parameters,
        { feeLimit: input.feeLimit, callValue: input.callValueSun },
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
    input: TransactionModeInput & {
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
    let contractAddress: string | undefined;
    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      ...tronTransactionHooks(gateway),
      signerOptions: { requireSoftware: true },
      confirm: tronConfirmation(gateway, scope),
      build: async (from) => {
        const tx = await gateway.deployContract(from, input);
        const hex = (tx as { contract_address?: string }).contract_address;
        if (hex) contractAddress = tronHexToBase58(hex);
        return tx;
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
}
