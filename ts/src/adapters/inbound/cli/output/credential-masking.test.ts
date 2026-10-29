import { describe, it, expect } from "vitest";
import { createOutputFormatter } from "./index.js";
import { maskCredentials } from "./mask.js";
import { EvmRpcClient } from "../../../outbound/chain/evm/evm.js";
import { FetchHttpTransport, networkHttpConfig } from "../../../outbound/http/index.js";
import { ExecutionError, normalizeError, type CliError } from "../../../../domain/errors/index.js";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import type { StreamManager } from "../contracts/index.js";

const API_KEY = "fictional-api-key-0001";
const network = {
  id: "eip155:1",
  family: "evm",
  chainId: "1",
  nativeSymbol: "ETH",
  capabilities: [],
  httpEndpoint: "https://unused.invalid",
  apiKeyHeader: "X-Api-Key",
  apiKey: API_KEY,
} as NetworkDescriptor;

// A provider that echoes the request's API key in a JSON-RPC error body.
async function echoedKeyError(): Promise<CliError> {
  const transport = new FetchHttpTransport(networkHttpConfig(network, 1000), async (_url, init) => {
    const key = new Headers(init?.headers).get("X-Api-Key");
    const body = {
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32000, message: `invalid API key: ${key}` },
    };
    return new Response(JSON.stringify(body), { status: 200 });
  });
  try {
    await new EvmRpcClient(network, 1000, transport).getBlockNumber();
  } catch (error) {
    return normalizeError(error);
  }
  throw new Error("expected the RPC call to fail");
}

function capture(mode: "json" | "text", error: CliError): string {
  let out = "";
  const streams = {
    result: (s: string) => (out += s),
    errorLine: (s: string) => (out += s),
    warnings: () => [],
  } as unknown as StreamManager;
  createOutputFormatter(mode, streams, Date.now(), [API_KEY]).error(error);
  return out;
}

describe("error outputs mask the credentials a request used", () => {
  it.each(["json", "text"] as const)(
    "masks an echoed network apiKey in %s output",
    async (mode) => {
      const error = await echoedKeyError();
      expect(error.message).toContain(API_KEY);

      const out = capture(mode, error);
      expect(out).not.toContain(API_KEY);
      expect(out).toContain("********");
      expect(out).toContain("rpc_error");
    },
  );

  it("masks a detail held in a class instance in json output", () => {
    class Header {
      constructor(readonly line: string) {}
    }
    const error = new ExecutionError("rpc_error", "provider refused the request", {
      header: new Header(`k=${API_KEY}`),
    } as never);
    const out = capture("json", error);
    expect(out).not.toContain(API_KEY);
    expect(out).toContain("k=********");
  });

  it("masks the JSON-escaped form of a credential", () => {
    const credential = 'key"with\\quote';
    const json = JSON.stringify({ message: `bad ${credential}`, n: 1 });
    expect(maskCredentials(json, [credential])).toBe('{"message":"bad ********","n":1}');
  });

  it("masks the longer of two overlapping credentials whole", () => {
    expect(maskCredentials("a-secret-longer", ["secret", "a-secret-longer"])).toBe("********");
  });
});
