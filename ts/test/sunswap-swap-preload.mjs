/** Serve the real CLI's read-only router preconditions without reaching public services. */
import { createServer } from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { Buffer } from "node:buffer";
import { URL } from "node:url";

const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const TRX = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
const word = (value) => BigInt(value).toString(16).padStart(64, "0");
const replies = {
  "getTokenState(address)": word(0), // USDT is not a SunPump token.
  "decimals()": word(6),
  "symbol()": word(32) + word(4) + Buffer.from("USDT").toString("hex").padEnd(64, "0"),
};

function unexpected(detail) {
  const message = `Unexpected fixture request: ${detail}`;
  process.stderr.write(`${message}\n`);
  return new Error(message);
}

// Fail closed if a config regression sends the RPC or route query to a public service.
https.request = () => {
  throw unexpected("external HTTPS");
};
syncBuiltinESMExports();

const server = createServer(async (request, response) => {
  response.setHeader("content-type", "application/json");
  response.setHeader("connection", "close");
  try {
    const url = new URL(request.url, "http://localhost");
    if (request.method === "POST" && url.pathname === "/wallet/triggerconstantcontract") {
      let body = "";
      for await (const chunk of request) body += chunk;
      const { function_selector: selector } = JSON.parse(body);
      if (!(selector in replies)) throw unexpected(selector);
      response.end(
        JSON.stringify({ result: { result: true }, constant_result: [replies[selector]] }),
      );
      return;
    }
    if (request.method === "GET" && url.pathname === "/swap/routerUniversal") {
      const from = url.searchParams.get("fromToken");
      const to = url.searchParams.get("toToken");
      if (!((from === USDT && to === TRX) || (from === TRX && to === USDT))) {
        throw unexpected(`pair ${from}/${to}`);
      }
      response.end(
        JSON.stringify({
          code: 0,
          data: [
            {
              amountInRaw: url.searchParams.get("amountIn"),
              amountOutRaw: "1000000",
              fee: "0",
              impact: "0",
              tokens: [from, to],
              symbols: from === USDT ? ["USDT", "TRX"] : ["TRX", "USDT"],
              poolFees: ["3000", "0"],
              poolVersions: ["V2"],
            },
          ],
        }),
      );
      return;
    }
    throw unexpected(`${request.method} ${url.pathname}`);
  } catch (error) {
    response.writeHead(500);
    response.end(JSON.stringify({ error: String(error) }));
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
server.unref();
const origin = `http://127.0.0.1:${server.address().port}`;
const fetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof globalThis.Request ? input.url : input);
  if (url.origin !== origin) throw unexpected(`external fetch ${url.origin}`);
  return fetch(input, init);
};
writeFileSync(
  join(process.env.WALLET_CLI_HOME, "config.yaml"),
  JSON.stringify({
    networks: {
      "tron:728126428": {
        httpEndpoint: origin,
        sunswap: { routerApiBaseUrl: origin },
      },
    },
  }),
);
