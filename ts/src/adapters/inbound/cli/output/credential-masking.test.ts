import { describe, it, expect, vi } from "vitest";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { createOutputFormatter } from "./index.js";
import { credentialForms, maskForms } from "./mask.js";
import { EvmRpcClient } from "../../../outbound/chain/evm/evm.js";
import { FetchHttpTransport, networkHttpConfig } from "../../../outbound/http/index.js";
import { ExecutionError, type CliError } from "../../../../domain/errors/index.js";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import { StreamManager } from "../stream/index.js";
import { HelpService } from "../help/index.js";
import { CommandRegistry } from "../registry/index.js";
import { main } from "../../../../bootstrap/runner.js";
import { normalizeCliError } from "./errors.js";

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
  const transport = new FetchHttpTransport(networkHttpConfig(network), async (_url, init) => {
    const key = new Headers(init?.headers).get("X-Api-Key");
    const body = {
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32000, message: `invalid API key: ${key}` },
    };
    return new Response(JSON.stringify(body), { status: 200 });
  });
  try {
    await new EvmRpcClient(network, transport).getBlockNumber();
  } catch (error) {
    return normalizeCliError(error);
  }
  throw new Error("expected the RPC call to fail");
}

function streams(mode: "json" | "text", credentials = [API_KEY], verbose = true) {
  const out: string[] = [];
  const err: string[] = [];
  const sm = new StreamManager(
    mode,
    verbose,
    (s) => out.push(s),
    (s) => err.push(s),
    undefined,
    credentials,
  );
  return { sm, all: () => out.join("") + err.join(""), out, err };
}

function capture(mode: "json" | "text", error: CliError): string {
  const { sm, all } = streams(mode);
  createOutputFormatter(mode, sm, Date.now()).error(error);
  return all();
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
    expect(maskForms(json, credentialForms([credential]))).toBe('{"message":"bad ********","n":1}');
  });

  it("masks the longer of two overlapping credentials whole", () => {
    expect(maskForms("a-secret-longer", credentialForms(["secret", "a-secret-longer"]))).toBe(
      "********",
    );
  });

  it("masks a credential in the form the text renderer escapes it", () => {
    const credential = "key\u0085‮end";
    const { sm, all } = streams("text", [credential]);
    createOutputFormatter("text", sm, 0).error(
      new ExecutionError("rpc_error", `bad ${credential}`),
    );
    expect(all()).toContain("bad ********");
  });
});

describe("the stream writer masks every output path", () => {
  it.each(["json", "text"] as const)("masks a success result in %s output", (mode) => {
    const { sm, out } = streams(mode);
    const formatter = createOutputFormatter(mode, sm, 0);
    sm.result(formatter.success("probe", undefined, { echo: API_KEY }));
    expect(out.join("")).not.toContain(API_KEY);
    expect(out.join("")).toContain("********");
  });

  it("masks a text formatter's output", () => {
    const { sm, out } = streams("text");
    const formatter = createOutputFormatter("text", sm, 0);
    sm.result(formatter.success("probe", undefined, {}, () => `key ${API_KEY}`));
    expect(out.join("")).toBe("key ********\n");
  });

  it.each(["json", "text"] as const)("masks a warning in %s output", (mode) => {
    const { sm, all } = streams(mode);
    sm.diagnostic("warn", `provider said ${API_KEY}`);
    sm.result(createOutputFormatter(mode, sm, 0).success("probe", undefined, {}));
    expect(all()).not.toContain(API_KEY);
    expect(all()).toContain("provider said ********");
  });

  it.each(["json", "text"] as const)("masks a progress event in %s output", (mode) => {
    const { sm, err } = streams(mode);
    sm.event(
      createOutputFormatter(mode, sm, 0).event({ type: "activity", message: `using ${API_KEY}` }),
    );
    expect(err.join("")).not.toContain(API_KEY);
    expect(err.join("")).toContain("using ********");
  });

  it("masks a log line and a verbose diagnostic", () => {
    const { sm, err } = streams("text");
    sm.errorLine(`line ${API_KEY}`);
    sm.diagnostic("debug", `debug ${API_KEY}`);
    expect(err).toEqual(["line ********\n", "debug ********\n"]);
  });

  it("masks --json-schema output", () => {
    const registry = new CommandRegistry();
    registry.addChain(
      {
        path: ["probe"],
        network: "optional",
        wallet: "none",
        auth: "none",
        baseFields: z.object({ key: z.string().default(API_KEY).describe(`uses ${API_KEY}`) }),
        examples: [],
      },
      "tron",
      { run: async () => ({}) },
    );
    const { sm, out } = streams("json");
    new HelpService(registry, sm, "0.0.0").handleMeta(["probe", "--json-schema"]);
    expect(out.join("")).not.toContain(API_KEY);
    expect(out.join("")).toContain("********");
  });
});

describe("the internal-error path masks configured credentials", () => {
  it.each(["json", "text"] as const)("in %s output", async (mode) => {
    const home = mkdtempSync(join(tmpdir(), "wcli-mask-"));
    const configPath = join(home, "config.yaml");
    writeFileSync(configPath, `tronlinkSecretId: ${API_KEY}\n`);
    chmodSync(configPath, 0o600);
    const previous = process.env.WALLET_CLI_HOME;
    process.env.WALLET_CLI_HOME = home;
    const written: string[] = [];
    const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
    const helpSpy = vi.spyOn(HelpService.prototype, "handleMeta").mockImplementation(() => {
      throw new Error(`boom ${API_KEY}`);
    });
    try {
      const code = await main(["node", "wallet-cli", "--help", "-v", "-o", mode]);
      expect(code).toBe(1);
      expect(written.join("")).toContain("boom ********");
      expect(written.join("")).not.toContain(API_KEY);
    } finally {
      helpSpy.mockRestore();
      outSpy.mockRestore();
      errSpy.mockRestore();
      if (previous === undefined) delete process.env.WALLET_CLI_HOME;
      else process.env.WALLET_CLI_HOME = previous;
    }
  });
});
