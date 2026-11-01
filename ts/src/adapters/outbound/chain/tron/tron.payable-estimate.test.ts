import { expect, it, vi } from "vitest";
import { TronRpcClient } from "./tron.js";
import { withTronWeb } from "./__test-support__/tronweb.js";
import { sunAmount } from "../../../../domain/amounts/index.js";
it.each([undefined, sunAmount("0"), sunAmount("8847971")])(
  "estimates payable calls with the supplied SUN amount: %s",
  async (value) => {
    const { client, tronweb } = withTronWeb(() => new TronRpcClient("http://localhost:1"));
    const trigger = vi.fn(async () => ({ energy_used: 123 }));
    tronweb.transactionBuilder.triggerConstantContract = trigger as never;
    vi.spyOn(client, "getEnergyPrices").mockResolvedValue([
      { sinceMs: 0, sunPerUnit: 100 },
      { sinceMs: 1754644200000, sunPerUnit: 420 },
    ]);
    vi.spyOn(client, "getAccountResources").mockResolvedValue({
      energy: { used: 0, limit: 0 },
      bandwidth: { used: 0, limit: 0 },
      votingPower: { total: 0, used: 0 },
    });
    expect(await client.estimateResources("owner", "contract", "swap()", [], value)).toMatchObject({
      energy: 123,
      energyPriceSun: "420",
    });
    expect(trigger).toHaveBeenCalledWith(
      "contract",
      "swap()",
      { callValue: Number(value ?? 0) },
      [],
      "owner",
    );
  },
);
it("rejects unsafe callValue before the SDK converts it", async () => {
  const { client, tronweb } = withTronWeb(() => new TronRpcClient("http://localhost:1"));
  const trigger = vi.fn();
  tronweb.transactionBuilder.triggerConstantContract = trigger;
  await expect(
    client.estimateEnergy("owner", "contract", "swap()", [], "9007199254740992"),
  ).rejects.toBeTruthy();
  expect(trigger).not.toHaveBeenCalled();
});
