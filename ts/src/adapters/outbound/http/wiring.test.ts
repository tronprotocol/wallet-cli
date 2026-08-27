import { afterEach, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { evmFamily } from "../../../bootstrap/families/evm.js";
import { tronFamily } from "../../../bootstrap/families/tron.js";
import { TronGridHistoryReader } from "../chain/tron/history-reader.js";
import type { EvmNetworkDescriptor, TronNetworkDescriptor } from "../../../domain/types/index.js";

let server: Server | undefined;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) =>
    server!.close((error) => (error ? reject(error) : resolve())),
  );
  server = undefined;
});

async function listen(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<string> {
  server = createServer(handler);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe("network API-key wire coverage", () => {
  it("maps a missing HTTP endpoint to the existing RPC error before I/O", () => {
    const evm = {
      id: "evm:1",
      family: "evm",
      chainId: "1",
      nativeSymbol: "ETH",
      capabilities: [],
    } satisfies EvmNetworkDescriptor;
    const tron = {
      id: "tron:nile",
      family: "tron",
      chainId: "nile",
      nativeSymbol: "TRX",
      capabilities: [],
    } satisfies TronNetworkDescriptor;

    for (const create of [
      () => evmFamily.createGateway(evm, 1_000),
      () => tronFamily.createGateway(tron, 1_000),
    ]) {
      let error: unknown;
      try {
        create();
      } catch (caught) {
        error = caught;
      }
      expect(error).toMatchObject({ code: "rpc_error" });
    }
  });

  it("sends the configured header through the assembled EVM gateway", async () => {
    let receivedKey: string | undefined;
    const endpoint = await listen((request, response) => {
      receivedKey = request.headers["x-provider-key"] as string | undefined;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x0" }));
    });
    const network: EvmNetworkDescriptor = {
      id: "evm:1",
      family: "evm",
      chainId: "1",
      nativeSymbol: "ETH",
      capabilities: [],
      httpEndpoint: endpoint,
      apiKeyHeader: "X-Provider-Key",
      apiKey: "header-secret",
    };

    await evmFamily
      .createGateway(network, 1_000)
      .getNativeBalance("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");

    expect(receivedKey).toBe("header-secret");
  });

  it("sends the configured header through a direct TRON FullNode request", async () => {
    let receivedKey: string | undefined;
    const endpoint = await listen((request, response) => {
      receivedKey = request.headers["tron-pro-api-key"] as string | undefined;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ balance: 42 }));
    });
    const network: TronNetworkDescriptor = {
      id: "tron:nile",
      family: "tron",
      chainId: "nile",
      nativeSymbol: "TRX",
      capabilities: [],
      httpEndpoint: endpoint,
      apiKeyHeader: "TRON-PRO-API-KEY",
      apiKey: "tron-secret",
    };

    await tronFamily
      .createGateway(network, 1_000)
      .getNativeBalance("T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb");

    expect(receivedKey).toBe("tron-secret");
  });

  it("sends the configured header through TronWeb's HTTP provider", async () => {
    let receivedKey: string | undefined;
    const endpoint = await listen((request, response) => {
      receivedKey = request.headers["tron-pro-api-key"] as string | undefined;
      response.setHeader("content-type", "application/json");
      response.end("{}");
    });
    const network: TronNetworkDescriptor = {
      id: "tron:nile",
      family: "tron",
      chainId: "nile",
      nativeSymbol: "TRX",
      capabilities: [],
      httpEndpoint: endpoint,
      apiKeyHeader: "TRON-PRO-API-KEY",
      apiKey: "tron-secret",
    };

    await tronFamily.createGateway(network, 1_000).getNodeInfo();

    expect(receivedKey).toBe("tron-secret");
  });

  it("sends the configured header through the TRON History request", async () => {
    let receivedKey: string | undefined;
    const endpoint = await listen((request, response) => {
      receivedKey = request.headers["tron-pro-api-key"] as string | undefined;
      response.setHeader("content-type", "application/json");
      response.end('{"data":[]}');
    });
    const network: TronNetworkDescriptor = {
      id: "tron:nile",
      family: "tron",
      chainId: "nile",
      nativeSymbol: "TRX",
      capabilities: [],
      httpEndpoint: endpoint,
      apiKeyHeader: "TRON-PRO-API-KEY",
      apiKey: "tron-secret",
    };

    await new TronGridHistoryReader(1_000).get(network, "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb", {
      limit: 1,
    });

    expect(receivedKey).toBe("tron-secret");
  });
});
