import { describe, expect, it, vi } from "vitest";
import { AgentService } from "./agent-service.js";
import type { AgentContractPorts } from "../ports/agent-registry.js";
import type { AgentRegistryReader, AgentRegistrationLoader } from "../ports/agent-sdk.js";
import type { NetworkDescriptor } from "../../domain/types/index.js";
import type { TransactionScope } from "../contracts/execution-scope.js";

const owner = "0x1111111111111111111111111111111111111111";
const operator = "0x2222222222222222222222222222222222222222";
const registryAddress = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const evmNet = { id: "eip155:56", family: "evm", chainId: "56" } as NetworkDescriptor;
function fixture(stage = "submitted") {
  const send = vi.fn(
    async (_scope: TransactionScope, _net: NetworkDescriptor, _input: unknown) => ({
      stage,
      txId: "0xabc",
      kind: "contract-send",
    }),
  );
  const contracts = {
    evm: { call: vi.fn(), send },
    tron: { call: vi.fn(), send },
  } as AgentContractPorts;
  const reader = {
    registry: vi.fn(() => registryAddress),
    read: vi.fn(async (_net: NetworkDescriptor, method: string): Promise<unknown> => {
      if (method === "ownerOf(uint256)") return owner;
      if (method === "tokenURI(uint256)") return "ipfs://old";
      if (method === "getApproved(uint256)") return operator;
      return true;
    }),
    registeredAgentId: vi.fn(async () => "9007199254740993"),
  } satisfies AgentRegistryReader;
  const metadata = {
    load: vi.fn(async () => ({ metadata: { name: "Example" } })),
  } satisfies AgentRegistrationLoader;
  const scope = {
    wait: stage !== "submitted",
    warn: vi.fn(),
    resolveAddress: () => owner,
  } as unknown as TransactionScope;
  return { service: new AgentService(contracts, reader, metadata), send, reader, metadata, scope };
}

describe("AgentService beta integration", () => {
  it("shows authoritative on-chain fields and independently loaded metadata", async () => {
    const { service } = fixture();
    expect(await service.show(evmNet, "56:42")).toEqual({
      agentId: "42",
      owner,
      uri: "ipfs://old",
      approved: operator,
      registry: registryAddress,
      metadata: { name: "Example" },
    });
  });
  it("keeps chain data when metadata cannot be loaded", async () => {
    const f = fixture();
    f.metadata.load.mockResolvedValue({ warning: "Metadata unavailable" } as never);
    expect(await f.service.show(evmNet, "42")).toMatchObject({
      owner,
      uri: "ipfs://old",
      warnings: ["Metadata unavailable"],
    });
  });
  it("rejects cross-network IDs before any RPC", async () => {
    const f = fixture();
    await expect(f.service.show(evmNet, "97:42")).rejects.toMatchObject({ code: "invalid_value" });
    expect(f.reader.read).not.toHaveBeenCalled();
  });
  it("returns submitted register without fetching a receipt", async () => {
    const f = fixture();
    expect(await f.service.register(f.scope, evmNet, { uri: "ipfs://new" })).toMatchObject({
      stage: "submitted",
      txId: "0xabc",
      uri: "ipfs://new",
    });
    expect(f.reader.registeredAgentId).not.toHaveBeenCalled();
    expect(f.send).toHaveBeenCalledOnce();
  });
  it("decodes the minted ID only after confirmed registration", async () => {
    const f = fixture("confirmed");
    expect(await f.service.register(f.scope, evmNet, { uri: "ipfs://new" })).toMatchObject({
      stage: "confirmed",
      agentId: "9007199254740993",
    });
  });
  it("retains confirmed tx evidence if the registration event is unavailable", async () => {
    const f = fixture("confirmed");
    f.reader.registeredAgentId.mockRejectedValue(new Error("rpc secret"));
    expect(await f.service.register(f.scope, evmNet, { uri: "ipfs://new" })).toMatchObject({
      stage: "confirmed",
      txId: "0xabc",
    });
    expect(f.scope.warn).toHaveBeenCalled();
    expect(f.send).toHaveBeenCalledOnce();
  });
  it("does not enrich reverted registrations", async () => {
    const f = fixture("failed");
    expect(await f.service.register(f.scope, evmNet, { uri: "ipfs://new" })).toMatchObject({
      stage: "failed",
    });
    expect(f.reader.registeredAgentId).not.toHaveBeenCalled();
  });
  it("updates URI and reads actual final state only after confirmation", async () => {
    const f = fixture("confirmed");
    f.reader.read.mockResolvedValueOnce("ipfs://old").mockResolvedValueOnce("ipfs://actual");
    expect(await f.service.update(f.scope, evmNet, { id: "42", uri: "ipfs://new" })).toMatchObject({
      oldURI: "ipfs://old",
      newURI: "ipfs://actual",
      requestedURI: "ipfs://new",
      agentId: "42",
    });
    expect(f.send).toHaveBeenCalledOnce();
  });
  it("does not fetch metadata before or during a write", async () => {
    const f = fixture();
    await f.service.update(f.scope, evmNet, { id: "42", uri: "ipfs://new" });
    expect(f.metadata.load).not.toHaveBeenCalled();
    expect(f.reader.read).toHaveBeenCalledTimes(1);
  });
  it("transfers from the actual owner and reports confirmed owner", async () => {
    const f = fixture("confirmed");
    f.reader.read.mockResolvedValueOnce(owner).mockResolvedValueOnce(operator);
    expect(
      await f.service.transfer(f.scope, evmNet, { id: "42", newOwner: operator }),
    ).toMatchObject({ oldOwner: owner, newOwner: operator, agentId: "42" });
    expect(f.send).toHaveBeenCalledWith(
      f.scope,
      evmNet,
      expect.objectContaining({
        method: "transferFrom(address,address,uint256)",
        params: [
          { type: "address", value: owner },
          { type: "address", value: operator },
          { type: "uint256", value: "42" },
        ],
      }),
    );
  });
  it("marks approve as ERC721 and keeps transaction control flags", async () => {
    const f = fixture();
    await f.service.approve(f.scope, evmNet, { id: "42", operator, signOnly: true });
    expect(f.send).toHaveBeenCalledWith(
      f.scope,
      evmNet,
      expect.objectContaining({ approvalKind: "erc721", signOnly: true }),
    );
  });
  it("revokes a TRON agent with the TRON zero address", async () => {
    const f = fixture();
    const net = {
      family: "tron",
      id: "tron:3448148188",
      chainId: "3448148188",
    } as NetworkDescriptor;
    await f.service.approve(f.scope, net, {
      id: "42",
      revoke: true,
      buildOnly: true,
      permissionId: 2,
      expiration: 60000,
    });
    expect(f.send).toHaveBeenCalledWith(
      f.scope,
      net,
      expect.objectContaining({
        buildOnly: true,
        permissionId: 2,
        expiration: 60000,
        approvalKind: "erc721",
        parameters: [
          { type: "address", value: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb" },
          { type: "uint256", value: "42" },
        ],
      }),
    );
  });
  it("sets owner-wide operators without loading an Agent", async () => {
    const f = fixture();
    await f.service.operatorAdd(f.scope, evmNet, { operator });
    await f.service.operatorRemove(f.scope, evmNet, { operator });
    expect(f.send.mock.calls.map((call) => (call[2] as Record<string, unknown>).params)).toEqual([
      [
        { type: "address", value: operator },
        { type: "bool", value: true },
      ],
      [
        { type: "address", value: operator },
        { type: "bool", value: false },
      ],
    ]);
    expect(f.reader.read).not.toHaveBeenCalled();
  });
});
