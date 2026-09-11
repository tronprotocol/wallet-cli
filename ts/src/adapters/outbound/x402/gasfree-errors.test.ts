import { expect, it, vi } from "vitest";
import { x402Client, wrapFetchWithPayment } from "@bankofai/x402-fetch";
import { ExactGasFreeTronScheme } from "@bankofai/x402-tron/gasfree/client";
import { X402PaymentClient } from "./payment-client.js";

it("reports the installed SDK's GasFree shortfall before signing, without a wallet fallback", async () => {
  const payer = "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ";
  const gasfreeAddress = "TSNEPtuCagKEgF2EU4pAKWLzXLz1bekfTE";
  const asset = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
  const signTypedData = vi.fn();
  const readContract = vi.fn(async () => 1_000_000n);
  const scheme = new ExactGasFreeTronScheme(
    { address: payer, readContract, signTypedData } as never,
    {
      apiClients: {
        "tron:0x2b6653dc": {
          getAddressInfo: async () => ({
            gasFreeAddress: gasfreeAddress,
            active: true,
            assets: [{ tokenAddress: asset, transferFee: "1000000" }],
          }),
          getProviders: async () => [{ address: payer }],
        },
      } as never,
    },
  );
  const sdk = new x402Client();
  sdk.setSpendControls(false);
  sdk.register("tron:0x2b6653dc", scheme);
  const challenge = {
    x402Version: 2,
    resource: { url: "https://example.test/pay" },
    accepts: [
      {
        scheme: "exact_gasfree",
        network: "tron:0x2b6653dc",
        amount: "1000000",
        asset,
        payTo: payer,
        maxTimeoutSeconds: 300,
      },
    ],
  };
  const fetcher = vi.fn(
    async () =>
      new Response(null, {
        status: 402,
        headers: { "payment-required": Buffer.from(JSON.stringify(challenge)).toString("base64") },
      }),
  );
  const client = new X402PaymentClient(
    { assertCanSign: vi.fn(), resolve: () => ({ address: payer }) } as never,
    globalThis.fetch,
    async () => wrapFetchWithPayment(fetcher, sdk),
  );
  await expect(
    client.pay(
      { activeAccount: "payer" } as never,
      { id: "tron:728126428", family: "tron", chainId: "728126428" } as never,
      { url: "https://example.test/pay", method: "GET", headers: [] },
    ),
  ).rejects.toMatchObject({
    code: "gasfree_insufficient_balance",
    details: { paymentStatus: "not_sent", retryPayment: false },
  });
  expect(readContract).toHaveBeenCalledWith(expect.objectContaining({ args: [gasfreeAddress] }));
  expect(signTypedData).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledOnce();
});
