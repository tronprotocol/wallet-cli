import { describe, it, expect } from "vitest";
import { TronRpcClient } from "./tron.js";

const SIGNED = { txID: "abc", signature: ["sig"] } as never;
const SECRET_URL = "https://rpc.provider.com/v1/APIKEY_SECRET123/jsonrpc?token=zzz";

describe("TronRpcClient error redaction (I-03)", () => {
  it("broadcast throw path keeps code/prefix but redacts the endpoint URL", async () => {
    const client = new TronRpcClient("http://localhost:1", 200);
    client.tronweb.trx.sendRawTransaction = (() => {
      throw new Error(`fetch failed: request to ${SECRET_URL} timed out`);
    }) as never;

    await expect(client.broadcast(SIGNED)).rejects.toMatchObject({ code: "rpc_error" });
    const err = await client.broadcast(SIGNED).catch((e) => e as Error);
    expect(err.message).toContain("TRON broadcast failed:");
    expect(err.message).toContain("https://rpc.provider.com");
    expect(err.message).not.toContain("APIKEY_SECRET123");
    expect(err.message).not.toContain("token=zzz");
  });

  it("node-reject path redacts the decoded reject message", async () => {
    const client = new TronRpcClient("http://localhost:1", 200);
    client.tronweb.trx.sendRawTransaction = (() =>
      Promise.resolve({ result: false, code: "SIGERROR", message: Buffer.from(SECRET_URL).toString("hex") })) as never;

    const err = await client.broadcast(SIGNED).catch((e) => e as Error);
    expect(err.message).toContain("TRON broadcast rejected:");
    expect(err.message).not.toContain("APIKEY_SECRET123");
  });
});
