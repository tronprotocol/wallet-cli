import { describe, it, expect } from "vitest";
import { TronContractService } from "./contract-service.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

const NET = { id: "tron:nile", family: "tron", chainId: "nile" } as unknown as NetworkDescriptor;
const SCOPE = {} as unknown as TransactionScope;
const DEPLOY_INPUT = { abi: [], bytecode: "0x00", feeLimit: "1000000000", parameters: [] };
const CONTRACT_HEX = "41a614f803b6fd780986a42c78ec9c7f77e6ded13c";
const CONTRACT_B58 = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

// Fake pipeline: invoke build() (so deploy's closure captures the address), then return a canned
// outcome. The stage decides which outcomeData branch runs.
function service(opts: { deployTx: Record<string, unknown>; outcome: Record<string, unknown> }) {
  const gateway = {
    async deployContract() {
      return opts.deployTx;
    },
  } as unknown as TronGateway;
  const gateways = { get: () => gateway } as unknown as ChainGatewayProvider;
  const pipeline = {
    assertCanSign() {},
    async run(p: { build: (from: string) => Promise<unknown> }) {
      await p.build("Towner");
      return opts.outcome;
    },
  } as unknown as TxPipeline;
  return new TronContractService(gateways, pipeline);
}

describe("TronContractService.deploy — contractAddress", () => {
  it("broadcast: exposes the deployed address in base58", async () => {
    const view = await service({
      deployTx: { contract_address: CONTRACT_HEX },
      outcome: { stage: "submitted", txId: "tx123" },
    }).deploy(SCOPE, NET, DEPLOY_INPUT);
    expect(view.kind).toBe("contract-deploy");
    expect(view.contractAddress).toBe(CONTRACT_B58);
  });

  it("dry-run: address captured at build time even without broadcast", async () => {
    const view = await service({
      deployTx: { contract_address: CONTRACT_HEX },
      outcome: { stage: "plan", tx: { txID: "d" }, fee: {} },
    }).deploy(SCOPE, NET, DEPLOY_INPUT);
    expect(view.contractAddress).toBe(CONTRACT_B58);
    expect((view as { mode?: string }).mode).toBe("dry-run");
  });

  it("undefined-safe: builder omits contract_address", async () => {
    const view = await service({
      deployTx: { txID: "d" },
      outcome: { stage: "submitted", txId: "tx123" },
    }).deploy(SCOPE, NET, DEPLOY_INPUT);
    expect(view.contractAddress).toBeUndefined();
  });
});
