/**
 * EvmContractService — read-only `contract call`.
 *
 * Thin on purpose, mirroring TronContractService: the ABI encoding lives in the gateway, where
 * the TRON family already keeps it (TronWeb does that job there). The result comes back as raw
 * hex, exactly as TRON's already does — `--method "balanceOf(address)"` declares parameter types
 * and nothing about the return, so there is nothing to decode against without guessing.
 */
import { describe, it, expect, vi } from "vitest";
import { EvmContractService } from "./contract-service.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

const net = { id: "evm:1", family: "evm", nativeSymbol: "ETH" } as NetworkDescriptor;
const TOKEN = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

function service(result = "0x") {
  const seen: unknown[] = [];
  const gateway = {
    callFunction: async (...args: unknown[]) => {
      seen.push(args);
      return result;
    },
  };
  return {
    svc: new EvmContractService({ get: () => gateway } as unknown as ChainGatewayProvider),
    seen,
  };
}

describe("EvmContractService.call", () => {
  it("passes the contract, signature and typed parameters to the gateway", async () => {
    const { svc, seen } = service();
    const params = [{ type: "address", value: OWNER }];
    await svc.call(net, TOKEN, "balanceOf(address)", params);

    expect(seen[0]).toEqual([TOKEN, "balanceOf(address)", params]);
  });

  it("returns the node's result as raw hex, undecoded", async () => {
    const raw = `0x${(123n).toString(16).padStart(64, "0")}`;
    const { svc } = service(raw);

    await expect(svc.call(net, TOKEN, "decimals()", [])).resolves.toEqual({
      contract: TOKEN,
      method: "decimals()",
      result: raw,
    });
  });
});

/**
 * `contract send` and `contract deploy`.
 *
 * Both go through the same pipeline as `tx send`, so the fee model, nonce source and broadcast
 * guard are shared rather than re-implemented. What is specific here is the calldata and, for a
 * deployment, the address — which CREATE derives from the sender and nonce, so it is known at
 * signing time rather than only from a receipt.
 */
import type { TxPipeline, TxPipelineParams } from "../../services/pipeline/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";

function scope(): TransactionScope {
  return {
    activeAccount: "wlt_test",
    resolveAddress: () => OWNER,
    timeoutMs: 100,
    wait: false,
    waitTimeoutMs: 100,
    emit: vi.fn(),
    warn: vi.fn(),
  };
}

function writeHarness() {
  const gateway = {
    getTransactionCount: vi.fn(async () => "9"),
    feeData: vi.fn(async () => ({
      baseFeeWei: "100",
      gasPriceWei: "110",
      suggestedPriorityWei: "10",
    })),
    estimateGas: vi.fn(async () => "120000"),
    encodeFunctionCall: vi.fn(() => "0xcalldata"),
    encodeDeploy: vi.fn(() => "0xdeploydata"),
    contractAddressFor: vi.fn(() => "0xDEPLOYED"),
    encodeTransactionHex: vi.fn(() => "0xhex"),
    getTransactionReceipt: vi.fn(async () => null),
  };
  const built: Record<string, unknown>[] = [];
  const pipeline = {
    assertCanSign: vi.fn(),
    run: vi.fn(async (params: TxPipelineParams) => {
      const tx = (await params.build(OWNER)) as Record<string, unknown>;
      built.push(tx);
      return { stage: "plan" as const, tx, fee: await params.estimate(tx) };
    }),
  } as unknown as TxPipeline;
  const service = new EvmContractService(
    { get: () => gateway } as unknown as ChainGatewayProvider,
    pipeline,
  );
  return { service, gateway, built };
}

describe("EvmContractService.send", () => {
  it("addresses the contract and carries the encoded call", async () => {
    const { service, built, gateway } = writeHarness();
    await service.send(scope(), net, {
      contract: TOKEN,
      method: "transfer(address,uint256)",
      params: [{ type: "address", value: OWNER }],
    } as never);

    expect(gateway.encodeFunctionCall).toHaveBeenCalled();
    expect(built[0]).toMatchObject({ to: TOKEN, data: "0xcalldata", value: "0", nonce: 9 });
  });

  it("attaches native value when the call is payable", async () => {
    const { service, built } = writeHarness();
    await service.send(scope(), net, {
      contract: TOKEN,
      method: "deposit()",
      callValue: "1",
    } as never);

    // 1 native coin at 18 decimals.
    expect(built[0]!.value).toBe("1000000000000000000");
  });

  it("uses the node's gas estimate rather than a transfer-sized default", async () => {
    const { service, built } = writeHarness();
    await service.send(scope(), net, { contract: TOKEN, method: "deposit()" } as never);

    expect(built[0]!.gasLimit).toBe("120000");
  });
});

describe("EvmContractService.deploy", () => {
  it("builds a transaction with no recipient", async () => {
    const { service, built } = writeHarness();
    await service.deploy(scope(), net, { bytecode: "0x6080" } as never);

    expect(built[0]!.to).toBeUndefined();
    expect(built[0]!.data).toBe("0xdeploydata");
  });

  it("reports the CREATE address derived from sender and nonce", async () => {
    const { service, gateway } = writeHarness();
    const out = (await service.deploy(scope(), net, {
      bytecode: "0x6080",
    } as never)) as { contractAddress?: string };

    expect(gateway.contractAddressFor).toHaveBeenCalledWith(OWNER, "9");
    expect(out.contractAddress).toBe("0xDEPLOYED");
  });

  /**
   * The service decides nothing about how the arguments are typed — it forwards the resolved
   * source to the gateway. The defect this replaces was exactly a decision made here: the service
   * substituted an empty ABI (`input.abi ?? "[]"`) whenever none was supplied, which on EVM was
   * always, so every constructor argument failed with "expectedCount=0".
   */
  it("forwards the resolved constructor arguments to the encoder", async () => {
    const { service, gateway } = writeHarness();
    const constructorArgs = {
      source: "signature" as const,
      signature: "constructor(uint256)",
      values: [42],
      flag: "--constructor-args",
    };

    await service.deploy(scope(), net, { bytecode: "0x6080", constructorArgs } as never);

    expect(gateway.encodeDeploy).toHaveBeenCalledWith("0x6080", constructorArgs);
  });

  it("says 'no arguments' rather than inventing an empty ABI when none were given", async () => {
    const { service, gateway } = writeHarness();
    await service.deploy(scope(), net, { bytecode: "0x6080" } as never);

    expect(gateway.encodeDeploy).toHaveBeenCalledWith("0x6080", { source: "none" });
  });
});
