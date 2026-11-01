import { afterEach, describe, expect, it, vi } from "vitest";
import { processBroadcastGuard } from "../../../../application/services/broadcast-guard.js";
import { submitWithTxId } from "../../../../application/services/broadcast-identity.js";
import {
  DeadlineExpiredError,
  type DispatchCheck,
} from "../../../../application/contracts/deadline.js";
import { EvmRpcClient } from "./evm.js";
import { expiredCheck } from "../../http/__test-support__/dispatch.js";

const RAW = "0x02f8b1";
const HASH = `0x${"ab".repeat(32)}`;

afterEach(() => vi.unstubAllGlobals());

// A node that counts requests and answers only when the request is aborted.
function silentNode() {
  const sent: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          sent.push(init.body);
          init.signal?.addEventListener("abort", () => reject(init.signal!.reason));
        }),
    ),
  );
  return {
    client: new EvmRpcClient("https://node.example", undefined, processBroadcastGuard),
    sent,
  };
}

describe("EvmRpcClient.sendRawTransaction dispatch", () => {
  it("refuses an expired submit before sending, so no txId is attached", async () => {
    const { client, sent } = silentNode();
    const error = await submitWithTxId(HASH, () =>
      client.sendRawTransaction(RAW, expiredCheck()),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DeadlineExpiredError);
    expect(error).not.toHaveProperty("details.txId");
    expect(sent).toEqual([]);
  });

  it("reports a sent transaction whose reply is lost as timeout with the hash", async () => {
    const { client, sent } = silentNode();
    const controller = new AbortController();
    const check: DispatchCheck = { signal: controller.signal, assertDispatchable: () => {} };
    const pending = submitWithTxId(HASH, () => client.sendRawTransaction(RAW, check)).catch(
      (e: unknown) => e,
    );
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    controller.abort(new DeadlineExpiredError());
    expect(await pending).toMatchObject({ code: "timeout", details: { txId: HASH } });
  });
});
