import { describe, it, expect } from "vitest";
import { TronRpcClient } from "./tron.js";

/**
 * Pins the broadcast accept/reject guard against responses captured verbatim from a Nile node
 * on 2026-08-04 (raw bytes in .private/broadcast-samples/).
 *
 * The shapes are NOT symmetric, which is the whole point:
 *
 *   POST /wallet/broadcasttransaction  accepted → {"result":true,"txid":"…"}
 *                                      rejected → {"code":"…","message":"…","txid":"…"}   ← no `result`
 *   POST /wallet/broadcasthex          accepted → {"result":true,"code":"SUCCESS",…}
 *                                      rejected → {"result":false,"code":"…",…}
 *
 * A rejection therefore cannot be detected by looking for `result === false` — on the JSON
 * endpoint the field is absent. Only "did the node explicitly say true" separates the two on
 * both endpoints. `code` cannot do it either: an accepted broadcasthex also carries a `code`.
 */

const SIGNED = { txID: "abc", signature: ["sig"] } as never;

// a real signed TransferContract, re-encoded from the captured accepted-broadcasthex sample.
// broadcastHex decodes its input before the RPC, so the hex has to be genuine.
const SIGNED_HEX =
  "0a510a0296e22208f570a64883d4b3dc4090f496d8fc335a330801122f0a2d747970652e676f6f676c65617069732e63" +
  "6f6d2f70726f746f636f6c2e5472616e73666572436f6e747261637470b09f93d8fc331241dbf97fbce238ca9970b504" +
  "eae3bccf5c447c6f76de1c0c500bd6f9038fa948f46717f42ae941ab4116860b59d97add88c20e971e5522caf5edf379" +
  "537ecffc031b";

const REJECT_NO_RESULT_FIELD = {
  code: "CONTRACT_VALIDATE_ERROR",
  // hex-encoded, exactly as the node sends it
  message: Buffer.from("Contract validate error : account [T…] does not exist").toString("hex"),
  txid: "c6b3021357e73a2672b7ad714ab7d9dca3601ef72138822f07116827012457ca",
};

describe("TronRpcClient broadcast guard — node rejection must never read as accepted", () => {
  it("broadcast throws when the node rejects without a `result` field", async () => {
    const client = new TronRpcClient("http://localhost:1", 200);
    client.tronweb.trx.sendRawTransaction = (() =>
      Promise.resolve(REJECT_NO_RESULT_FIELD)) as never;

    await expect(client.broadcast(SIGNED)).rejects.toMatchObject({ code: "transaction_rejected" });
  });

  it("broadcastHex throws when the node rejects without a `result` field", async () => {
    const client = new TronRpcClient("http://localhost:1", 200);
    client.tronweb.trx.sendHexTransaction = (() =>
      Promise.resolve(REJECT_NO_RESULT_FIELD)) as never;

    await expect(client.broadcastHex(SIGNED_HEX)).rejects.toMatchObject({
      code: "transaction_rejected",
    });
  });

  // The guard is a white-list, so the failure mode it introduces is over-rejection. Both accepted
  // shapes are pinned here; note they differ (the hex endpoint also returns code:"SUCCESS").
  it("broadcast accepts the captured {result:true, txid} response", async () => {
    const client = new TronRpcClient("http://localhost:1", 200);
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
    const client = new TronRpcClient("http://localhost:1", 200);
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
