import {
  CommandDeadline,
  requestDispatchCheck,
} from "../../../../application/services/command-deadline.js";
import { describe, it, expect } from "vitest";
import { processBroadcastGuard } from "../../../../application/services/broadcast-guard.js";
import { TronRpcClient } from "./tron.js";
import { withTronWeb } from "./__test-support__/tronweb.js";

const NO_CHECK = requestDispatchCheck(new CommandDeadline(0));

const SIGNED = { txID: "abc", signature: ["sig"] } as never;
const SECRET_URL = "https://rpc.provider.com/v1/APIKEY_SECRET123/jsonrpc?token=zzz";

describe("TronRpcClient error redaction (I-03)", () => {
  it("broadcast throw path keeps code/prefix but redacts the endpoint URL", async () => {
    const { client, tronweb } = withTronWeb(
      () => new TronRpcClient("http://localhost:1", undefined, processBroadcastGuard),
    );
    tronweb.trx.sendRawTransaction = (() => {
      throw new Error(`fetch failed: request to ${SECRET_URL} timed out`);
    }) as never;

    await expect(client.broadcast(SIGNED, NO_CHECK)).rejects.toMatchObject({ code: "rpc_error" });
    const err = (await client.broadcast(SIGNED, NO_CHECK).catch((e) => e)) as Error;
    expect(err.message).toContain("TRON broadcast failed:");
    expect(err.message).toContain("https://rpc.provider.com");
    expect(err.message).not.toContain("APIKEY_SECRET123");
    expect(err.message).not.toContain("token=zzz");
  });

  it("node-reject path redacts the decoded reject message", async () => {
    const { client, tronweb } = withTronWeb(
      () => new TronRpcClient("http://localhost:1", undefined, processBroadcastGuard),
    );
    tronweb.trx.sendRawTransaction = (() =>
      Promise.resolve({
        result: false,
        code: "SIGERROR",
        message: Buffer.from(SECRET_URL).toString("hex"),
      })) as never;

    const err = (await client.broadcast(SIGNED, NO_CHECK).catch((e) => e)) as Error;
    expect(err.message).toContain("TRON broadcast rejected:");
    expect(err.message).not.toContain("APIKEY_SECRET123");
  });
});
