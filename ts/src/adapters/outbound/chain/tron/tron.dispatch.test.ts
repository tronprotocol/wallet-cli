import { describe, it, expect } from "vitest";
import { processBroadcastGuard } from "../../../../application/services/broadcast-guard.js";
import { submitWithTxId } from "../../../../application/services/broadcast-identity.js";
import {
  DeadlineExpiredError,
  type DispatchCheck,
} from "../../../../application/contracts/deadline.js";
import { TronRpcClient } from "./tron.js";
import { withTronWeb } from "./__test-support__/tronweb.js";
import { expiredCheck } from "../../http/__test-support__/dispatch.js";

const TX_ID = "0d10b8f45a67f953034721ec7108721d17964a83a60a501c45db868816762431";
const SIGNED = { txID: TX_ID, signature: ["sig"], raw_data: {}, raw_data_hex: "00" } as never;

// A node whose broadcast endpoint counts requests and never answers.
function silentNode() {
  const { client, tronweb } = withTronWeb(
    () => new TronRpcClient("http://localhost:1", undefined, processBroadcastGuard),
  );
  const sent: string[] = [];
  tronweb.fullNode.instance.request = ((config: { url?: string }) => {
    sent.push(String(config.url));
    return new Promise(() => {});
  }) as never;
  return { client, sent };
}

describe("TronRpcClient broadcast dispatch", () => {
  it("refuses an expired submit before sending, so no txId is attached", async () => {
    const { client, sent } = silentNode();
    const error = await submitWithTxId(TX_ID, () => client.broadcast(SIGNED, expiredCheck())).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DeadlineExpiredError);
    expect(error).not.toHaveProperty("details.txId");
    expect(sent).toEqual([]);
  });

  it("reports a sent broadcast whose reply is lost as timeout with the txId", async () => {
    const { client, sent } = silentNode();
    const controller = new AbortController();
    const check: DispatchCheck = { signal: controller.signal, assertDispatchable: () => {} };
    const pending = submitWithTxId(TX_ID, () => client.broadcast(SIGNED, check)).catch(
      (e: unknown) => e,
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(sent).toHaveLength(1);
    controller.abort(new DeadlineExpiredError());
    expect(await pending).toMatchObject({ code: "timeout", details: { txId: TX_ID } });
  });

  it("runs the submit check after a queue delay and refuses when too little time is left", async () => {
    const { client, sent } = silentNode();
    let admitted = true;
    const check: DispatchCheck = {
      signal: new AbortController().signal,
      assertDispatchable: () => {
        if (!admitted) throw new DeadlineExpiredError("too little time is left to submit");
      },
    };
    // Two reads hold both permits, so the broadcast waits in the queue.
    void client.getAccount("T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb").catch(() => {});
    void client.getAccount("T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb").catch(() => {});
    admitted = false;
    const error = await Promise.race([
      client.broadcast(SIGNED, check).catch((e: unknown) => e),
      new Promise((resolve) => setTimeout(() => resolve("still queued"), 50)),
    ]);
    expect(error).toBe("still queued");
    expect(sent.filter((url) => url.includes("broadcast"))).toEqual([]);
  });
});
