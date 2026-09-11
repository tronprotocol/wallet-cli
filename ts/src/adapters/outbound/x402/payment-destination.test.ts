import { expect, it, vi } from "vitest";
import { X402PaymentClient } from "./payment-client.js";

const address = "0x060f7fd9c9622bdcf9f2887c8171d6e6b4b4ba17";
const network = { id: "eip155:56", family: "evm", chainId: "56" };
function fixture(
  payTo: string,
  amount = "1000000000000000000",
  selectedNetwork = network,
  token = "USDT",
  asset = "0x55d398326f99059fF775485246999027B3197955",
  expectedPayTo = address,
) {
  const resolve = vi.fn(() => {
    throw new Error("must not resolve signer");
  });
  const fetcher = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          x402Version: 2,
          resource: { url: "https://example.com" },
          accepts: [
            {
              scheme: "exact",
              network: selectedNetwork.family === "tron" ? "tron:0x2b6653dc" : selectedNetwork.id,
              asset,
              payTo,
              amount,
              maxTimeoutSeconds: 300,
            },
          ],
        }),
        { status: 402, headers: { "content-type": "application/json" } },
      ),
  );
  const client = new X402PaymentClient({ resolve, assertCanSign: vi.fn() } as never, fetcher);
  const pay = (dryRun = false) =>
    client.pay({ timeoutMs: 1000 } as never, selectedNetwork as never, {
      url: "https://example.com",
      method: "POST",
      headers: [],
      expectedPayTo,
      exactAmount: "1",
      maxAmount: "1",
      token,
      dryRun,
    });
  return { pay, resolve, fetcher };
}
it.each([
  ["0x1111111111111111111111111111111111111111", "1000000000000000000"],
  [address, "999999999999999999"],
  [address, "1000000000000000001"],
])("rejects an unexpected destination or amount before resolving a signer", async (to, amount) => {
  const { pay, resolve, fetcher } = fixture(to, amount);
  await expect(pay()).rejects.toMatchObject({ code: "no_matching_requirement" });
  expect(resolve).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  [
    { id: "eip155:8453", family: "evm", chainId: "8453" },
    "USDC",
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "0x10bf3d09bd80a00ddbbfe934c7dcc477b42ffdb0",
  ],
  [
    { id: "tron:728126428", family: "tron", chainId: "728126428" },
    "USDT",
    "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    "TSNEPtuCagKEgF2EU4pAKWLzXLz1bekfTE",
  ],
])("checks the token precision and destination on %s", async (net, token, asset, to) => {
  await expect(fixture(to, "1000000", net, token, asset, to).pay(true)).resolves.toMatchObject({
    paymentRequired: true,
  });
  const underpaid = fixture(to, "999999", net, token, asset, to);
  await expect(underpaid.pay()).rejects.toMatchObject({ code: "no_matching_requirement" });
  expect(underpaid.resolve).not.toHaveBeenCalled();
});
it("accepts an EVM address with different casing at the exact amount", async () => {
  await expect(fixture(address.toUpperCase()).pay(true)).resolves.toMatchObject({
    paymentRequired: true,
  });
});
