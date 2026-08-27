import { describe, it, expect } from "vitest";
import { TronContractService } from "./contract-service.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

const NET = {
  id: "tron:nile",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "nile",
} as unknown as NetworkDescriptor;
const SCOPE = {} as unknown as TransactionScope;
const DEPLOY_INPUT = { abi: [], bytecode: "0x00", feeLimit: "1000000000", parameters: [] };
const CONTRACT_HEX = "41a614f803b6fd780986a42c78ec9c7f77e6ded13c";
const CONTRACT_B58 = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const PREPARED_HEX = "41b20b47cd2008731fd794274b736db24958f88edd";
const PREPARED_B58 = "TSCcnz8iNBFDbccr4mfByskq8TDhCHLW3n";

// Fake pipeline: run build() then prepare() the way TxPipeline does — deploy captures the address
// from the prepared transaction — then return a canned outcome. The stage decides which
// outcomeData branch runs. `prepareTransaction` stands in for the identity refresh.
function service(opts: {
  deployTx: Record<string, unknown>;
  outcome: Record<string, unknown>;
  preparedAddress?: string;
}) {
  const gateway = {
    async deployContract() {
      return opts.deployTx;
    },
    prepareTransaction(tx: Record<string, unknown>) {
      return "preparedAddress" in opts ? { ...tx, contract_address: opts.preparedAddress } : tx;
    },
  } as unknown as TronGateway;
  const gateways = { get: () => gateway } as unknown as ChainGatewayProvider;
  const pipeline = {
    assertCanSign() {},
    async run(p: {
      build: (from: string) => Promise<unknown>;
      prepare: (tx: unknown, o: { permissionId: number }) => unknown;
    }) {
      p.prepare(await p.build("Towner"), { permissionId: 0 });
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

  it("dry-run: address reported even without broadcast", async () => {
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

  // --permission-id / --expiration rewrite raw_data, so preparation recomputes the txID and with it
  // the deployed address. Reporting the builder's address would name a contract nobody deploys.
  it("broadcast with --permission-id: reports the prepared address, not the builder's", async () => {
    const view = await service({
      deployTx: { contract_address: CONTRACT_HEX },
      preparedAddress: PREPARED_HEX,
      outcome: { stage: "submitted", txId: "tx123" },
    }).deploy(SCOPE, NET, { ...DEPLOY_INPUT, permissionId: 2 });
    expect(view.contractAddress).toBe(PREPARED_B58);
  });

  it("build-only with --expiration: reports the prepared address, not the builder's", async () => {
    const view = await service({
      deployTx: { contract_address: CONTRACT_HEX },
      preparedAddress: PREPARED_HEX,
      outcome: { stage: "built", tx: { txID: "d" }, hex: "0a", fee: {} },
    }).deploy(SCOPE, NET, { ...DEPLOY_INPUT, buildOnly: true, expiration: 86_400_000 });
    expect(view.contractAddress).toBe(PREPARED_B58);
  });

  it("drops the address when preparation leaves none", async () => {
    const view = await service({
      deployTx: { contract_address: CONTRACT_HEX },
      preparedAddress: undefined,
      outcome: { stage: "submitted", txId: "tx123" },
    }).deploy(SCOPE, NET, DEPLOY_INPUT);
    expect(view.contractAddress).toBeUndefined();
  });
});
