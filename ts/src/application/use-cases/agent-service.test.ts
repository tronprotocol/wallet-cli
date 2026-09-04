import { Interface } from "ethers";
import { describe, expect, it, vi } from "vitest";
import { AgentService } from "./agent-service.js";
import type { AgentContractPorts } from "../ports/agent-registry.js";
import type { NetworkDescriptor } from "../../domain/types/index.js";

const ABI = new Interface([
  "function ownerOf(uint256 agentId) view returns (address)",
  "function tokenURI(uint256 agentId) view returns (string)",
  "function getApproved(uint256 agentId) view returns (address)",
  "function isApprovedForAll(address owner,address operator) view returns (bool)",
]);

const evmNet = { id: "eip155:56", family: "evm" } as NetworkDescriptor;

describe("AgentService", () => {
  it("loads one agent directly from the registry", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({
        result: ABI.encodeFunctionResult("ownerOf", ["0x1111111111111111111111111111111111111111"]),
      })
      .mockResolvedValueOnce({ result: ABI.encodeFunctionResult("tokenURI", ["ipfs://agent"]) })
      .mockResolvedValueOnce({
        result: ABI.encodeFunctionResult("getApproved", [
          "0x2222222222222222222222222222222222222222",
        ]),
      });
    const ports = {
      evm: { call, send: vi.fn() },
      tron: { call: vi.fn(), send: vi.fn() },
    } as unknown as AgentContractPorts;

    await expect(new AgentService(ports).show(evmNet, "42")).resolves.toEqual({
      agentId: "42",
      owner: "0x1111111111111111111111111111111111111111",
      uri: "ipfs://agent",
      approved: "0x2222222222222222222222222222222222222222",
      registry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    });
  });

  it("builds register through the existing contract transaction port", async () => {
    const send = vi.fn(async () => ({ stage: "submitted", txId: "0xabc" }));
    const ports = {
      evm: { call: vi.fn(), send },
      tron: { call: vi.fn(), send: vi.fn() },
    } as unknown as AgentContractPorts;
    const scope = {} as never;

    await new AgentService(ports).register(scope, evmNet, { uri: "ipfs://agent" });
    expect(send).toHaveBeenCalledWith(
      scope,
      evmNet,
      expect.objectContaining({
        method: "register(string)",
        params: [{ type: "string", value: "ipfs://agent" }],
      }),
    );
  });

  it("checks an owner-wide operator approval on chain", async () => {
    const call = vi.fn(async () => ({
      result: ABI.encodeFunctionResult("isApprovedForAll", [true]),
    }));
    const ports = {
      evm: { call, send: vi.fn() },
      tron: { call: vi.fn(), send: vi.fn() },
    } as unknown as AgentContractPorts;

    await expect(
      new AgentService(ports).operatorCheck(
        evmNet,
        "0x1111111111111111111111111111111111111111",
        "0x2222222222222222222222222222222222222222",
      ),
    ).resolves.toMatchObject({ approved: true });
  });
});
