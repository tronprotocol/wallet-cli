import { afterEach, describe, expect, it, vi } from "vitest";
import { processBroadcastGuard } from "../../../../application/services/broadcast-guard.js";
import { submitWithTxId } from "../../../../application/services/broadcast-identity.js";
import {
  DeadlineExpiredError,
  type DispatchCheck,
} from "../../../../application/contracts/deadline.js";
import { EvmRpcClient } from "./evm.js";
import { expiredCheck } from "../../http/__test-support__/dispatch.js";
import { bindDispatchCheck } from "../../http/dispatch-context.js";

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

describe("EvmRpcClient.feeData dispatch", () => {
  it("fails with timeout when the deadline ends the suggested-tip read", async () => {
    const sent: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        const { id, method } = JSON.parse(String(init.body)) as { id: number; method: string };
        sent.push(method);
        if (method === "eth_maxPriorityFeePerGas") {
          return new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(init.signal!.reason));
          });
        }
        const result = method === "eth_gasPrice" ? "0x1" : { baseFeePerGas: "0x5" };
        return Promise.resolve(new Response(JSON.stringify({ jsonrpc: "2.0", id, result })));
      }),
    );
    const controller = new AbortController();
    const check: DispatchCheck = {
      signal: controller.signal,
      assertDispatchable: () => {
        if (controller.signal.aborted) throw controller.signal.reason;
      },
    };
    const client = bindDispatchCheck(
      new EvmRpcClient("https://node.example", undefined, processBroadcastGuard),
      check,
    );
    const pending = client.feeData().catch((e: unknown) => e);
    await vi.waitFor(() => expect(sent).toHaveLength(3));
    // Let the block and gas-price replies settle before the deadline ends the tip read.
    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort(new DeadlineExpiredError());

    expect(await pending).toMatchObject({ code: "timeout" });
  });
});
