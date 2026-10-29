import { describe, it, expect } from "vitest";
import {
  barBroadcasts,
  processBroadcastGuard,
} from "../../../../application/services/broadcast-guard.js";
import { TronRpcClient } from "./tron.js";

const SIGNED = { txID: "abc", signature: ["sig"] } as never;

// broadcastHex validates the protobuf before sending, so this fixture must decode.
const SIGNED_HEX =
  "0a510a0296e22208f570a64883d4b3dc4090f496d8fc335a330801122f0a2d747970652e676f6f676c65617069732e63" +
  "6f6d2f70726f746f636f6c2e5472616e73666572436f6e747261637470b09f93d8fc331241dbf97fbce238ca9970b504" +
  "eae3bccf5c447c6f76de1c0c500bd6f9038fa948f46717f42ae941ab4116860b59d97add88c20e971e5522caf5edf379" +
  "537ecffc031b";

const REJECT_NO_RESULT_FIELD = {
  code: "CONTRACT_VALIDATE_ERROR",
  message: Buffer.from("Contract validate error : account [T…] does not exist").toString("hex"),
  txid: "c6b3021357e73a2672b7ad714ab7d9dca3601ef72138822f07116827012457ca",
};

describe("TronRpcClient broadcast guard — node rejection must never read as accepted", () => {
  it("broadcast throws when the node rejects without a `result` field", async () => {
    const client = new TronRpcClient("http://localhost:1", 200, undefined, processBroadcastGuard);
    client.tronweb.trx.sendRawTransaction = (() =>
      Promise.resolve(REJECT_NO_RESULT_FIELD)) as never;

    await expect(client.broadcast(SIGNED)).rejects.toMatchObject({ code: "transaction_rejected" });
  });

  it("broadcastHex throws when the node rejects without a `result` field", async () => {
    const client = new TronRpcClient("http://localhost:1", 200, undefined, processBroadcastGuard);
    client.tronweb.trx.sendHexTransaction = (() =>
      Promise.resolve(REJECT_NO_RESULT_FIELD)) as never;

    await expect(client.broadcastHex(SIGNED_HEX)).rejects.toMatchObject({
      code: "transaction_rejected",
    });
  });

  it("broadcast accepts the captured {result:true, txid} response", async () => {
    const client = new TronRpcClient("http://localhost:1", 200, undefined, processBroadcastGuard);
    client.tronweb.trx.sendRawTransaction = (() =>
      Promise.resolve({
        result: true,
        txid: "0d10b8f45a67f953034721ec7108721d17964a83a60a501c45db868816762431",
      })) as never;

    await expect(client.broadcast(SIGNED)).resolves.toEqual({
      txId: "0d10b8f45a67f953034721ec7108721d17964a83a60a501c45db868816762431",
    });
  });

  it("broadcastHex accepts the captured {result:true, code:'SUCCESS', txid} response", async () => {
    const client = new TronRpcClient("http://localhost:1", 200, undefined, processBroadcastGuard);
    client.tronweb.trx.sendHexTransaction = (() =>
      Promise.resolve({
        result: true,
        code: "SUCCESS",
        message: "",
        txid: "1ca0b2a5bb7f39546c696f04de6a4ebac9e14b45deca9d9244d3e0fdba9144b3",
      })) as never;

    await expect(client.broadcastHex(SIGNED_HEX)).resolves.toEqual({
      txId: "1ca0b2a5bb7f39546c696f04de6a4ebac9e14b45deca9d9244d3e0fdba9144b3",
    });
  });
});

describe("TronRpcClient.broadcastHex classifies a recognised rejection", () => {
  it("gives a known rejection its own code, as broadcast does", async () => {
    const rejection = {
      result: false,
      code: "CONTRACT_VALIDATE_ERROR",
      message: Buffer.from(
        "Contract validate error : ExchangeTransactionContract is rejected",
      ).toString("hex"),
    };
    const client = new TronRpcClient("http://localhost:1", 200, undefined, processBroadcastGuard);
    client.tronweb.trx.sendHexTransaction = (() => Promise.resolve(rejection)) as never;

    await expect(client.broadcastHex(SIGNED_HEX)).rejects.toMatchObject({
      code: "exchange_trading_disabled",
    });
  });

  it("still falls back to transaction_rejected for wording it does not know", async () => {
    const client = new TronRpcClient("http://localhost:1", 200, undefined, processBroadcastGuard);
    client.tronweb.trx.sendHexTransaction = (() =>
      Promise.resolve({ result: false, code: "SIGERROR" })) as never;

    await expect(client.broadcastHex(SIGNED_HEX)).rejects.toMatchObject({
      code: "transaction_rejected",
    });
  });
});

describe("TronRpcClient broadcast keeps the node's own words in the message", () => {
  const NODE_TEXT =
    "token required must greater than expected (see https://node.example.com/report?token=SECRET123)";

  it("folds the node's words into the message, not just details, for a recognised rejection", async () => {
    const client = new TronRpcClient("http://localhost:1", 200, undefined, processBroadcastGuard);
    client.tronweb.trx.sendRawTransaction = (() =>
      Promise.resolve({
        code: "CONTRACT_VALIDATE_ERROR",
        message: Buffer.from(NODE_TEXT).toString("hex"),
        txid: "abc",
      })) as never;

    await expect(client.broadcast(SIGNED)).rejects.toMatchObject({
      code: "slippage_exceeded",
      message: expect.stringContaining("token required must greater than expected"),
    });
  });

  it("keeps details.nodeMessage for machine readers", async () => {
    const client = new TronRpcClient("http://localhost:1", 200, undefined, processBroadcastGuard);
    client.tronweb.trx.sendRawTransaction = (() =>
      Promise.resolve({
        code: "CONTRACT_VALIDATE_ERROR",
        message: Buffer.from(NODE_TEXT).toString("hex"),
        txid: "abc",
      })) as never;

    await expect(client.broadcast(SIGNED)).rejects.toMatchObject({
      details: {
        nodeMessage: expect.stringContaining("token required must greater than expected"),
      },
    });
  });

  it("still redacts the node's words before folding them into the message", async () => {
    const client = new TronRpcClient("http://localhost:1", 200, undefined, processBroadcastGuard);
    client.tronweb.trx.sendRawTransaction = (() =>
      Promise.resolve({
        code: "CONTRACT_VALIDATE_ERROR",
        message: Buffer.from(NODE_TEXT).toString("hex"),
        txid: "abc",
      })) as never;

    const error = await client.broadcast(SIGNED).catch((e) => e);
    expect(error.message).not.toContain("/report");
    expect(error.message).not.toContain("SECRET123");
    expect(error.message).toContain("https://node.example.com");
    expect(error.details.nodeMessage).not.toContain("SECRET123");
  });
});

describe("expired node responses", () => {
  it.each([false, true])(
    "maps expiration on either broadcast entry point (hex=%s)",
    async (hex) => {
      const client = new TronRpcClient("http://localhost:1", 200, undefined, processBroadcastGuard);
      const rejected = {
        result: false,
        code: "TRANSACTION_EXPIRATION_ERROR",
        message: Buffer.from("Transaction expired").toString("hex"),
      };
      client.tronweb.trx.sendRawTransaction = (() => Promise.resolve(rejected)) as never;
      client.tronweb.trx.sendHexTransaction = (() => Promise.resolve(rejected)) as never;
      await expect(
        hex ? client.broadcastHex(SIGNED_HEX) : client.broadcast(SIGNED),
      ).rejects.toMatchObject({
        code: "tx_expired",
        details: { nodeCode: "TRANSACTION_EXPIRATION_ERROR" },
      });
    },
  );
});

describe.each(["broadcast", "broadcastHex"] as const)(
  "TronRpcClient.%s malformed responses",
  (method) => {
    it.each([
      undefined,
      null,
      [],
      "ok",
      {},
      { result: false },
      { result: "true" },
      { result: 1 },
      { txid: "abc" },
      { message: {}, code: 42 },
    ])("reports %j as an unknown outcome", async (response) => {
      const client = new TronRpcClient("http://localhost:1", 200, undefined, processBroadcastGuard);
      client.tronweb.trx.sendRawTransaction = (() => Promise.resolve(response)) as never;
      client.tronweb.trx.sendHexTransaction = (() => Promise.resolve(response)) as never;
      await expect(
        method === "broadcast" ? client.broadcast(SIGNED) : client.broadcastHex(SIGNED_HEX),
      ).rejects.toMatchObject({ code: "invalid_node_response" });
    });
  },
);

describe.each(["broadcast", "broadcastHex"] as const)("TronRpcClient.%s guard", (method) => {
  function client(wired: boolean) {
    const sent: unknown[] = [];
    const rpc = wired
      ? new TronRpcClient("http://localhost:1", 200, undefined, processBroadcastGuard)
      : new TronRpcClient("http://localhost:1", 200);
    const accept = (tx: unknown) => {
      sent.push(tx);
      return Promise.resolve({ result: true, txid: "ab".repeat(32) });
    };
    rpc.tronweb.trx.sendRawTransaction = accept as never;
    rpc.tronweb.trx.sendHexTransaction = accept as never;
    const submit = () =>
      method === "broadcast" ? rpc.broadcast(SIGNED) : rpc.broadcastHex(SIGNED_HEX);
    return { sent, submit };
  }

  it("refuses while broadcasting is barred", async () => {
    const { sent, submit } = client(true);
    await barBroadcasts("tx broadcast --dry-run", async () => {
      await expect(submit()).rejects.toMatchObject({ code: "dry_run_violation" });
    });
    expect(sent).toEqual([]);
  });

  it("refuses when no broadcast guard is wired", async () => {
    const { sent, submit } = client(false);
    await expect(submit()).rejects.toMatchObject({ code: "internal_error" });
    expect(sent).toEqual([]);
  });
});
