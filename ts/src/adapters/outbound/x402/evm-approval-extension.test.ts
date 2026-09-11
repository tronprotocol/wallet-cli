import { afterEach, expect, it, vi } from "vitest";
import { Interface, Transaction, Wallet } from "ethers";
import { X402PaymentClient } from "./payment-client.js";
import { evmSignStrategy } from "../chain/evm/signing-strategy.js";
import type { TypedDataPayload } from "../../../domain/types/index.js";

afterEach(() => vi.unstubAllGlobals());

it.each(["56", "8453"])(
  "signs an ERC20 approval extension with valid gas on EVM chain %s",
  async (chainId) => {
    const wallet = Wallet.createRandom();
    const asset =
      chainId === "8453"
        ? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
        : "0x55d398326f99059fF775485246999027B3197955";
    const rpc = vi.fn<typeof fetch>(async (input, init) => {
      const request = new Request(input, init);
      expect(request.url).toBe("https://rpc.example/");
      const body = (await request.json()) as { method: string; id: number };
      const result =
        body.method === "eth_call"
          ? "0x" + "0".repeat(64)
          : body.method === "eth_getTransactionCount"
            ? "0x3"
            : null;
      return Response.json({ jsonrpc: "2.0", id: body.id, result });
    });
    vi.stubGlobal("fetch", rpc);
    const sign = vi.fn((tx: unknown) => evmSignStrategy.sign(wallet.privateKey, tx));
    const signTypedData = vi.fn((payload: TypedDataPayload) =>
      evmSignStrategy.signTypedData(wallet.privateKey, payload),
    );
    const extension = "erc20ApprovalGasSponsoring";
    const requirement = {
      scheme: "exact",
      network: `eip155:${chainId}`,
      amount: "1000000",
      asset,
      payTo: "0x2222222222222222222222222222222222222222",
      maxTimeoutSeconds: 300,
      extra: { assetTransferMethod: "permit2" },
    };
    const challenge = {
      x402Version: 2,
      resource: { url: "https://payment.example" },
      accepts: [requirement],
      extensions: { [extension]: { info: { version: "1" } } },
    };
    let approval: { signedTransaction: string; spender: string; amount: string } | undefined;
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const request = new Request(input, init);
      const header = request.headers.get("payment-signature");
      if (!header)
        return new Response(null, {
          status: 402,
          headers: {
            "payment-required": Buffer.from(JSON.stringify(challenge)).toString("base64"),
          },
        });
      const payload = JSON.parse(Buffer.from(header, "base64").toString());
      approval = payload.extensions[extension].info;
      return new Response("ok");
    });
    const client = new X402PaymentClient(
      {
        assertCanSign() {},
        resolve: () => ({
          address: wallet.address,
          kind: "software",
          sign,
          signTypedData,
        }),
      } as never,
      fetcher,
    );
    await expect(
      client.pay(
        { activeAccount: "payer", timeoutMs: 2000, emit() {} } as never,
        {
          family: "evm",
          chainId,
          id: `eip155:${chainId}`,
          httpEndpoint: "https://rpc.example",
        } as never,
        {
          url: "https://payment.example",
          method: "GET",
          headers: [],
          asset,
          maxRawAmount: "1000000",
        },
      ),
    ).resolves.toMatchObject({ delivered: true });
    expect(sign).toHaveBeenCalledOnce();
    const signedInput = sign.mock.calls[0]![0] as Record<string, unknown>;
    expect(signedInput).not.toHaveProperty("gas");
    const tx = Transaction.from(approval!.signedTransaction);
    expect(tx.gasLimit).toBeGreaterThan(0n);
    expect(tx.gasLimit).toBe(signedInput.gasLimit);
    expect(tx.from).toBe(wallet.address);
    expect(tx.chainId).toBe(BigInt(chainId));
    expect(tx.nonce).toBe(3);
    expect(tx.to).toBe(asset);
    const decoded = new Interface(["function approve(address,uint256)"]).decodeFunctionData(
      "approve",
      tx.data,
    );
    expect(decoded[0]).toBe(approval!.spender);
    expect(decoded[1].toString()).toBe(approval!.amount);
    expect(fetcher).toHaveBeenCalledTimes(2);
  },
);
