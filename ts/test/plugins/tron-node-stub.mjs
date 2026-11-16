// A controlled TRON node for the qaprobe transfer tests, loaded into the CLI process with --import.
// It points nile at itself, builds real transactions, and records every submission.
// QAPROBE_NODE selects the outcome: "ok" (default), "revert", or "lost" (the submission arrives
// but its reply never does). QAPROBE_OBSERVATIONS names the JSON-lines file each submission is
// appended to.
import { createServer } from "node:http";
import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { utils } from "tronweb";

const mode = process.env.QAPROBE_NODE ?? "ok";
const observations = process.env.QAPROBE_OBSERVATIONS;

const NUMBER = 1000;
const BLOCK_ID = NUMBER.toString(16).padStart(16, "0") + "ab".repeat(24);
const now = Date.now();
const block = (number = NUMBER) => ({
  blockID: number === NUMBER ? BLOCK_ID : number.toString(16).padStart(16, "0") + "cd".repeat(24),
  block_header: {
    raw_data: { number, timestamp: now, parentHash: "00".repeat(32), version: 31 },
  },
});

const keccak = (text) => utils.ethersUtils.keccak256(utils.ethersUtils.toUtf8Bytes(text));

function trigger(body) {
  const data = keccak(body.function_selector).slice(2, 10) + (body.parameter ?? "");
  const value = {
    data,
    owner_address: body.owner_address,
    contract_address: body.contract_address,
    ...(body.call_value ? { call_value: body.call_value } : {}),
  };
  const raw_data = {
    contract: [
      {
        parameter: { value, type_url: "type.googleapis.com/protocol.TriggerSmartContract" },
        type: "TriggerSmartContract",
        ...(body.Permission_id ? { Permission_id: body.Permission_id } : {}),
      },
    ],
    ref_block_bytes: BLOCK_ID.slice(12, 16),
    ref_block_hash: BLOCK_ID.slice(16, 32),
    expiration: now + 60_000,
    timestamp: now,
    fee_limit: body.fee_limit,
  };
  const pb = utils.transaction.txJsonToPb({ raw_data });
  const transaction = {
    visible: false,
    txID: utils.transaction.txPbToTxID(pb).slice(2),
    raw_data,
    raw_data_hex: utils.transaction.txPbToRawDataHex(pb),
  };
  return { result: { result: true }, energy_used: 30_000, transaction };
}

const submitted = new Set();

function reply(path, body) {
  switch (path) {
    case "/wallet/getblock":
    case "/wallet/getnowblock":
      return block();
    case "/wallet/getblockbynum":
      return block(body.num);
    case "/wallet/triggersmartcontract":
      return trigger(body);
    case "/wallet/triggerconstantcontract":
      return { result: { result: true }, energy_used: 30_000, constant_result: ["00".repeat(32)] };
    case "/wallet/getchainparameters":
      return { chainParameter: [{ key: "getEnergyFee", value: 100 }] };
    case "/wallet/broadcasttransaction":
      submitted.add(body.txID);
      return { result: true, txid: body.txID };
    case "/walletsolidity/gettransactioninfobyid":
    case "/wallet/gettransactioninfobyid":
      if (!submitted.size) return {};
      return {
        id: body.value,
        blockNumber: NUMBER + 1,
        blockTimeStamp: now,
        fee: 1_000_000,
        receipt: {
          energy_usage_total: 30_000,
          result: mode === "revert" ? "REVERT" : "SUCCESS",
        },
        ...(mode === "revert" ? { result: "FAILED", resMessage: "" } : {}),
      };
    default:
      return {};
  }
}

const server = createServer(async (request, response) => {
  let text = "";
  for await (const chunk of request) text += chunk;
  const body = text ? JSON.parse(text) : {};
  if (request.url === "/wallet/broadcasttransaction" && observations) {
    const event = { event: "submit", signatures: body.signature?.length ?? 0 };
    appendFileSync(observations, `${JSON.stringify(event)}\n`);
  }
  if (mode === "lost" && request.url === "/wallet/broadcasttransaction") {
    request.socket.destroy();
    return;
  }
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(reply(request.url, body)));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
server.unref();
writeFileSync(
  join(process.env.WALLET_CLI_HOME, "config.yaml"),
  `networks:\n  "tron:3448148188":\n    httpEndpoint: "http://127.0.0.1:${server.address().port}"\n`,
);
