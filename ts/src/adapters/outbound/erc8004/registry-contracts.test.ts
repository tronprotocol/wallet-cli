import { describe, expect, it, vi } from "vitest";
import { Interface } from "ethers";
import { registryContracts } from "./registry-contracts.js";
import { ChainError } from "../../../domain/errors/index.js";
import type { AgentContractPorts } from "../../../application/ports/agent-registry.js";
import type { NetworkDescriptor, TxReceiptView } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../../application/contracts/execution-scope.js";

const scope = {} as TransactionScope;
const network = { id: "eip155:56", family: "evm", chainId: "56" } as NetworkDescriptor;
const nonexistent = new Interface([
  "error ERC721NonexistentToken(uint256 tokenId)",
]).encodeErrorResult("ERC721NonexistentToken", [7]);

function ports(failure: unknown) {
  const send = vi.fn(async () => {
    throw failure;
  });
  const call = vi.fn(async () => ({ result: "0x01" }));
  const inner = {
    evm: { call, send },
    tron: { call: vi.fn(async () => ({ result: ["01"] })), send },
  } as unknown as AgentContractPorts;
  return { inner, send, call };
}

describe("registryContracts", () => {
  it.each(["evm", "tron"] as const)(
    "maps a %s registry revert to its error code",
    async (family) => {
      const { inner } = ports(
        new ChainError("execution_reverted", "execution reverted", { revertData: nonexistent }),
      );
      const send = registryContracts(inner)[family].send as (
        ...args: unknown[]
      ) => Promise<unknown>;
      await expect(send(scope, network, {})).rejects.toMatchObject({ code: "agent_not_found" });
    },
  );

  it("rethrows a failure that is not a registry revert unchanged", async () => {
    const failure = new ChainError("timeout", "eth_estimateGas timed out");
    const { inner } = ports(failure);
    await expect(registryContracts(inner).evm.send(scope, network, {} as never)).rejects.toBe(
      failure,
    );
  });

  it("forwards reads and successful writes", async () => {
    const { inner, call } = ports(undefined);
    const wrapped = registryContracts(inner);
    await expect(wrapped.evm.call(network, "0xc", "ownerOf(uint256)", [])).resolves.toEqual({
      result: "0x01",
    });
    expect(call).toHaveBeenCalledWith(network, "0xc", "ownerOf(uint256)", []);
    inner.evm.send = vi.fn(async () => ({ stage: "submitted" }) as TxReceiptView);
    await expect(wrapped.evm.send(scope, network, {} as never)).resolves.toEqual({
      stage: "submitted",
    });
  });
});
