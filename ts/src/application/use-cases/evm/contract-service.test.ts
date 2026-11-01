import { describe, it, expect, vi } from "vitest";
import { EvmContractService } from "./contract-service.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

const net = {
  id: "eip155:1",
  family: "evm",
  nativeSymbol: "ETH",
  chainId: "1",
  capabilities: [],
} as NetworkDescriptor;
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
    svc: new EvmContractService(
      { get: () => gateway } as unknown as ChainGatewayProvider,
      {} as unknown as TxPipeline,
    ),
    seen,
  };
}

describe("EvmContractService.call", () => {
  it("passes the contract, signature and typed parameters to the gateway", async () => {
    const { svc, seen } = service();
    const params = [{ type: "address", value: OWNER }];
    await svc.call(NO_DEADLINE, net, TOKEN, "balanceOf(address)", params);

    expect(seen[0]).toEqual([TOKEN, "balanceOf(address)", params]);
  });

  it("returns the node's result as raw hex, undecoded", async () => {
    const raw = `0x${123n.toString(16).padStart(64, "0")}`;
    const { svc } = service(raw);

    await expect(svc.call(NO_DEADLINE, net, TOKEN, "decimals()", [])).resolves.toEqual({
      contract: TOKEN,
      method: "decimals()",
      result: raw,
    });
  });
});

import type { TxPipeline, EvmTxPipelineParams } from "../../services/pipeline/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import { CommandDeadline } from "../../services/command-deadline.js";

const NO_DEADLINE = new CommandDeadline(0);

function scope(): TransactionScope {
  return {
    activeAccount: "wlt_test",
    resolveAddress: () => OWNER,
    deadline: new CommandDeadline(0),
    wait: false,

    emit: vi.fn(),
    warn: vi.fn(),
  };
}

function writeHarness() {
  const gateway = {
    getTransactionCount: vi.fn(async (_address: string, _block: string) => "9"),
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
    runEvm: vi.fn(async (params: EvmTxPipelineParams) => {
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

  it("forwards the resolved constructor arguments to the encoder", async () => {
    const { service, gateway } = writeHarness();
    const constructorArgs = {
      source: "signature" as const,
      signature: "constructor(uint256)",
      values: [42],
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

describe("EvmContractService.send — approve", () => {
  const SEPOLIA = { ...net, id: "eip155:11155111", chainId: "11155111" } as NetworkDescriptor;
  const scope = () =>
    ({
      deadline: NO_DEADLINE,
      activeAccount: "wlt_test",
      resolveAddress: () => OWNER,
      timeoutMs: 100,
      wait: false,
      waitTimeoutMs: 100,
      emit: vi.fn(),
      warn: vi.fn(),
    }) as never;
  const CONTRACT = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const SPENDER = "0x4f2a000000000000000000000000000000009b03";

  function approveHarness(decimals: number | Error = 6) {
    const gateway = {
      getTransactionCount: vi.fn(async () => "7"),
      feeData: vi.fn(async () => ({
        baseFeeWei: "100",
        gasPriceWei: "110",
        suggestedPriorityWei: "10",
      })),
      estimateGas: vi.fn(async () => "46200"),
      encodeFunctionCall: vi.fn(() => "0x095ea7b3"),
      getErc20Metadata: vi.fn(async () => {
        if (decimals instanceof Error) throw decimals;
        return { decimals, symbol: "USDC" };
      }),
    };
    const pipeline = {
      assertCanSign: vi.fn(),
      runEvm: vi.fn(async (params: EvmTxPipelineParams) => ({
        stage: "plan" as const,
        tx: await params.build(OWNER),
        fee: {},
      })),
    } as unknown as TxPipeline;
    const service = new EvmContractService(
      { get: () => gateway } as unknown as ChainGatewayProvider,
      pipeline,
    );
    return { service, gateway };
  }

  const send = (service: EvmContractService, rawAllowance: string, approvalKind?: "erc721") =>
    service.send(scope(), SEPOLIA, {
      contract: CONTRACT,
      method: "approve(address,uint256)",
      params: [
        { type: "address", value: SPENDER },
        { type: "uint256", value: rawAllowance },
      ],
      dryRun: true,
      approvalKind,
    } as never) as Promise<Record<string, unknown>>;

  it("reports the spender and the allowance in the token's own units", async () => {
    const { service } = approveHarness(6);

    await expect(send(service, "1000000")).resolves.toMatchObject({
      spender: SPENDER,
      allowance: "1",
      token: "USDC",
    });
  });

  it("calls the maximum allowance unlimited, without asking the contract anything", async () => {
    const { service, gateway } = approveHarness(6);

    await expect(send(service, String((1n << 256n) - 1n))).resolves.toMatchObject({
      allowance: "unlimited",
    });
    expect(gateway.getErc20Metadata).not.toHaveBeenCalled();
  });

  it("falls back to base units when the token's decimals cannot be read", async () => {
    const { service } = approveHarness(new Error("no decimals()"));

    await expect(send(service, "1000000")).resolves.toMatchObject({ allowance: "1000000" });
  });

  it("reports ERC-721 approval semantics without querying ERC-20 metadata", async () => {
    const { service, gateway } = approveHarness(6);

    await expect(send(service, "42", "erc721")).resolves.toMatchObject({
      identity: { operator: SPENDER, agentId: "42" },
    });
    expect(gateway.getErc20Metadata).not.toHaveBeenCalled();
  });

  it("adds nothing for any other method", async () => {
    const { service } = approveHarness(6);
    const out = (await service.send(scope(), SEPOLIA, {
      contract: CONTRACT,
      method: "transfer(address,uint256)",
      params: [
        { type: "address", value: SPENDER },
        { type: "uint256", value: "1000000" },
      ],
      dryRun: true,
    } as never)) as Record<string, unknown>;

    expect(out).not.toHaveProperty("spender");
    expect(out).not.toHaveProperty("allowance");
  });
});

describe("EvmContractService --dry-run — an explicit nonce the chain has moved past", () => {
  function staleNonceHarness() {
    const { service, gateway, built } = writeHarness();
    gateway.getTransactionCount.mockImplementation(async (_a: string, block: string) =>
      block === "latest" ? "10" : "12",
    );
    return { service, gateway, built };
  }

  it("refuses a contract send", async () => {
    const { service } = staleNonceHarness();
    await expect(
      service.send(scope(), net, {
        contract: TOKEN,
        method: "deposit()",
        dryRun: true,
        nonce: 9,
      } as never),
    ).rejects.toThrowError(expect.objectContaining({ code: "nonce_too_low" }));
  });

  it("refuses a deploy", async () => {
    const { service } = staleNonceHarness();
    await expect(
      service.deploy(scope(), net, { bytecode: "0x60006000", dryRun: true, nonce: 9 } as never),
    ).rejects.toThrowError(expect.objectContaining({ code: "nonce_too_low" }));
  });

  it("does not predict a contract address for a deploy it refuses", async () => {
    const { service, gateway } = staleNonceHarness();
    await expect(
      service.deploy(scope(), net, { bytecode: "0x60006000", dryRun: true, nonce: 9 } as never),
    ).rejects.toThrow();
    expect(gateway.contractAddressFor).not.toHaveBeenCalled();
  });

  it("still builds a deploy at the nonce the chain expects", async () => {
    const { service } = staleNonceHarness();
    await expect(
      service.deploy(scope(), net, { bytecode: "0x60006000", dryRun: true, nonce: 10 } as never),
    ).resolves.toBeDefined();
  });
});
