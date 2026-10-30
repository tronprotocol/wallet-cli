import { describe, expect, it, vi } from "vitest";
import type { TronGateway } from "../../ports/chain/tron/tron-gateway.js";
import { readVotingPower } from "./voting-power.js";

describe("readVotingPower", () => {
  it("reads the node's voting power for the address and derives what is still available", async () => {
    const getAccountResources = vi.fn(async () => ({
      energy: { used: 0, limit: 0 },
      bandwidth: { used: 0, limit: 0 },
      votingPower: { total: 100, used: 40 },
    }));
    const gateway = { getAccountResources } as unknown as TronGateway;

    await expect(readVotingPower(gateway, "TOwner")).resolves.toEqual({
      total: 100,
      used: 40,
      available: 60,
    });
    expect(getAccountResources).toHaveBeenCalledWith("TOwner");
  });
});
