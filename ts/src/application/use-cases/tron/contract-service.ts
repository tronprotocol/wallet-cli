import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronContractParameter } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import { outcomeData, transactionMode, type TransactionModeInput } from "../../services/transaction-mode.js";
import { tronConfirmation } from "../../services/tron-confirmation.js";

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
      callValueSun: number;
      feeLimit: number;
    },
  ) {
    const gateway = this.gateways.get(network, "tron");
    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
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
      family: "tron" as const,
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
      feeLimit: number;
      parameters: unknown[];
    },
  ) {
    const gateway = this.gateways.get(network, "tron");
    const outcome = await this.pipeline.run({
      ctx: scope,
      net: network,
      account: scope.activeAccount,
      broadcaster: gateway,
      ...transactionMode(input),
      confirm: tronConfirmation(gateway, scope),
      build: (from) => gateway.deployContract(from, input),
      estimate: async () => ({
        feeModel: "tron-resource",
        note: "deploy energy depends on bytecode size",
      }),
    });
    return { kind: "contract-deploy" as const, family: "tron" as const, ...outcomeData(outcome) };
  }

  async info(network: NetworkDescriptor, address: string) {
    const gateway = this.gateways.get(network, "tron");
    const [contract, info] = await Promise.all([
      gateway.getContract(address),
      gateway.getContractInfo(address).catch(() => undefined),
    ]);
    const methods = this.abiFunctions(contract, info);
    const contractView = (contract ?? {}) as any;
    const infoView = (info ?? {}) as any;
    return {
      address,
      name: contractView.name ?? infoView.name ?? undefined,
      functionCount: methods.length,
      methods,
      contract,
      info,
    };
  }

  private abiFunctions(contract: unknown, info: unknown): string[] {
    const contractView = (contract ?? {}) as any;
    const infoView = (info ?? {}) as any;
    const abi = contractView.abi ?? infoView.abi ?? contractView.ABI ?? infoView.ABI;
    const entries: unknown[] = Array.isArray(abi)
      ? abi
      : Array.isArray(abi?.entrys) ? abi.entrys : [];
    return entries
      .filter((entry: any) => entry && (entry.type === "Function" || entry.type === "function"))
      .map((entry: any) => entry.name)
      .filter((name: unknown): name is string => typeof name === "string" && name.length > 0);
  }
}
