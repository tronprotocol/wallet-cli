import { AbiCoder, Interface, id, toBeHex, zeroPadValue } from "ethers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentContractPorts } from "../../../application/ports/agent-registry.js";
import type {
  ChainGatewayProvider,
  EvmGateway,
} from "../../../application/ports/chain/gateway-provider.js";
import type { TronGateway } from "../../../application/ports/chain/tron-gateway.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { SdkAgentRegistry } from "./sdk-registry.js";

const sdkConstructions = vi.hoisted(() => [] as string[]);

vi.mock("@bankofai/8004-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@bankofai/8004-sdk")>();
  return {
    ...actual,
    SDK: class extends actual.SDK {
      constructor(config: ConstructorParameters<typeof actual.SDK>[0]) {
        sdkConstructions.push(config.network);
        super(config);
      }
    },
  };
});

const evmNetwork = (idValue: string, chainId = idValue.split(":")[1]!): NetworkDescriptor =>
  ({
    id: idValue,
    chainId,
    family: "evm",
    nativeSymbol: "ETH",
    capabilities: [],
  }) as NetworkDescriptor;

const tronNetwork = (idValue: string, chainId = idValue.split(":")[1]!): NetworkDescriptor =>
  ({
    id: idValue,
    chainId,
    family: "tron",
    nativeSymbol: "TRX",
    capabilities: [],
  }) as NetworkDescriptor;

function harness(
  options: {
    evmResult?: string;
    tronResult?: string;
    evmReceipt?: Record<string, unknown> | null;
    tronReceipt?: Record<string, unknown>;
  } = {},
) {
  const calls: Array<{ family: string; contract: string; method: string; params: unknown[] }> = [];
  const contracts = {
    evm: {
      call: async (
        _network: NetworkDescriptor,
        contract: string,
        method: string,
        params: unknown[],
      ) => {
        calls.push({ family: "evm", contract, method, params });
        return { result: options.evmResult ?? "0x" };
      },
    },
    tron: {
      call: async (
        _network: NetworkDescriptor,
        contract: string,
        method: string,
        params: unknown[],
      ) => {
        calls.push({ family: "tron", contract, method, params });
        return { result: [(options.tronResult ?? "0x").replace(/^0x/, "")] };
      },
    },
  } as unknown as AgentContractPorts;
  const evmGateway = {
    getTransactionReceipt: async () => options.evmReceipt ?? null,
  } as unknown as EvmGateway;
  const tronGateway = {
    getTransactionInfoById: async () => options.tronReceipt ?? {},
  } as unknown as TronGateway;
  const gateways = {
    get: (_network: NetworkDescriptor, family: "evm" | "tron") =>
      family === "evm" ? evmGateway : tronGateway,
  } as unknown as ChainGatewayProvider;
  return { registry: new SdkAgentRegistry(contracts, gateways), calls };
}

describe("SdkAgentRegistry", () => {
  beforeEach(() => sdkConstructions.splice(0));

  it("does not create SDK chain clients until an ERC-8004 network is used", () => {
    const { registry } = harness();

    expect(sdkConstructions).toEqual([]);
    registry.registry(evmNetwork("eip155:56"));
    registry.registry(evmNetwork("eip155:56"));
    expect(sdkConstructions).toEqual(["eip155:56"]);
  });

  it.each([
    [evmNetwork("eip155:56"), "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"],
    [evmNetwork("eip155:97"), "0x8004A818BFB912233c491871b3d84c89A494BD9e"],
    [evmNetwork("eip155:8453"), "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"],
    [evmNetwork("eip155:84532"), "0x8004A818BFB912233c491871b3d84c89A494BD9e"],
    [tronNetwork("tron:728126428"), "TFLvivMdKsk6v2GrwyD2apEr9dU1w7p7Fy"],
    [tronNetwork("tron:3448148188"), "TDDk4vc69nzBCbsY4kfu7gw2jmvbinirj5"],
    [tronNetwork("tron:2494104990"), "TH775ZzfJ5V25EZkFuX6SkbAP53ykXTcma"],
  ])("uses the published registry for $id", (network, expected) => {
    expect(harness().registry.registry(network)).toBe(expected);
  });

  it.each([
    [{ ...evmNetwork("eip155:56"), family: "tron" }],
    [evmNetwork("eip155:56", "97")],
    [{ ...tronNetwork("tron:728126428"), family: "evm" }],
    [tronNetwork("tron:728126428", "3448148188")],
  ] as Array<[NetworkDescriptor]>)(
    "rejects a descriptor whose id, family, and chain id disagree",
    (network) => {
      expect(() => harness().registry.registry(network)).toThrow(/does not match/);
    },
  );

  it("decodes an exact uint256 while retaining the existing EVM call transport", async () => {
    const large = 2n ** 200n + 123n;
    const result = AbiCoder.defaultAbiCoder().encode(["uint256"], [large]);
    const { registry, calls } = harness({ evmResult: result });
    const network = evmNetwork("eip155:56");
    const params = [{ type: "address", value: "0x1111111111111111111111111111111111111111" }];

    expect(await registry.read(network, "balanceOf(address)", params)).toBe(large);
    expect(calls).toEqual([
      {
        family: "evm",
        contract: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
        method: "balanceOf(address)",
        params,
      },
    ]);
  });

  it("normalizes a TRON address result and preserves the zero approval address", async () => {
    const result = AbiCoder.defaultAbiCoder().encode(
      ["address"],
      ["0x0000000000000000000000000000000000000000"],
    );
    const { registry } = harness({ tronResult: result });

    expect(
      await registry.read(tronNetwork("tron:728126428"), "getApproved(uint256)", [
        { type: "uint256", value: "9" },
      ]),
    ).toBe("T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb");
  });

  it("extracts a large EVM Registered id from the gateway's nested raw receipt", async () => {
    const agentId = 2n ** 200n + 987654321n;
    const event = new Interface([
      "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
    ]).encodeEventLog("Registered", [
      agentId,
      "ipfs://agent",
      "0x1111111111111111111111111111111111111111",
    ]);
    const registryAddress = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
    const { registry } = harness({
      evmReceipt: { success: true, raw: { logs: [{ address: registryAddress, ...event }] } },
    });

    expect(await registry.registeredAgentId(evmNetwork("eip155:56"), "0xtx")).toBe(
      agentId.toString(),
    );
  });

  it("ignores a matching EVM event emitted by another contract", async () => {
    const event = new Interface([
      "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
    ]).encodeEventLog("Registered", [
      42n,
      "ipfs://agent",
      "0x1111111111111111111111111111111111111111",
    ]);
    const { registry } = harness({
      evmReceipt: {
        logs: [{ address: "0x2222222222222222222222222222222222222222", ...event }],
      },
    });

    expect(await registry.registeredAgentId(evmNetwork("eip155:56"), "0xtx")).toBeUndefined();
  });

  it("extracts a TRON Registered id after filtering the emitting contract", async () => {
    const agentId = 2n ** 200n + 456n;
    const log = {
      // java-tron receipts use a 20-byte hex contract address without 0x or the 41 prefix.
      address: "3af43112221546eb8303e6c311f7ae54d5496822",
      topics: [
        id("Registered(uint256,string,address)"),
        zeroPadValue(toBeHex(agentId), 32),
        zeroPadValue("0x1111111111111111111111111111111111111111", 32),
      ],
      data: AbiCoder.defaultAbiCoder().encode(["string"], ["ipfs://agent"]),
    };
    const { registry } = harness({ tronReceipt: { blockNumber: 100, log: [log] } });

    expect(await registry.registeredAgentId(tronNetwork("tron:728126428"), "tx-id")).toBe(
      agentId.toString(),
    );
  });

  it.each([[evmNetwork("eip155:56")], [tronNetwork("tron:728126428")]])(
    "returns undefined when the gateway has no registration receipt on $id",
    async (network) => {
      expect(await harness().registry.registeredAgentId(network, "missing")).toBeUndefined();
    },
  );
});
