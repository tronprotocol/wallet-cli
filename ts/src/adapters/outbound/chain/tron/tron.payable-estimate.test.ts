import { expect, it, vi } from "vitest";
import { TronRpcClient } from "./tron.js";
it.each([undefined, "0", "8847971"])(
  "estimates payable calls with the supplied SUN amount: %s",
  async (value) => {
    const client = new TronRpcClient("http://localhost:1", 1000);
    const trigger = vi.fn(async () => ({ energy_used: 123 }));
    client.tronweb.transactionBuilder.triggerConstantContract = trigger as never;
    vi.spyOn(client, "getEnergyPrices").mockResolvedValue("0:100");
    vi.spyOn(client, "getAccountResources").mockResolvedValue(
      {} as Awaited<ReturnType<TronRpcClient["getAccountResources"]>>,
    );
    expect(await client.estimateResources("owner", "contract", "swap()", [], value)).toMatchObject({
      energy: 123,
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
  const client = new TronRpcClient("http://localhost:1", 1000);
  const trigger = vi.fn();
  client.tronweb.transactionBuilder.triggerConstantContract = trigger;
  await expect(
    client.estimateEnergy("owner", "contract", "swap()", [], "9007199254740992"),
  ).rejects.toBeTruthy();
  expect(trigger).not.toHaveBeenCalled();
});
