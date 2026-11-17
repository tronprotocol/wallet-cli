import { describe, it, expect, vi } from "vitest";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { createOutputFormatter } from "./index.js";
import { CredentialMask } from "./mask.js";
import { EvmRpcClient } from "../../../outbound/chain/evm/evm.js";
import { FetchHttpTransport, networkHttpConfig } from "../../../outbound/http/index.js";
import { ExecutionError, errorMessage, type CliError } from "../../../../domain/errors/index.js";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import { StreamManager } from "../stream/index.js";
import { HelpService } from "../help/index.js";
import { CommandRegistry } from "../registry/index.js";
import { main, runProcess } from "../../../../bootstrap/runner.js";
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
    expect(new CredentialMask([credential]).json(json)).toBe('{"message":"bad ********","n":1}');
    expect(new CredentialMask([credential]).text(json)).toBe('{"message":"bad ********","n":1}');
  });

  it("masks the longer of two overlapping credentials whole", () => {
    expect(new CredentialMask(["secret", "a-secret-longer"]).text("a-secret-longer")).toBe(
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
    sm.result(formatter.success("probe", undefined, { echo: API_KEY }), formatter.format);
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
    const formatter = createOutputFormatter(mode, sm, 0);
    sm.event(formatter.event({ type: "activity", message: `using ${API_KEY}` }), formatter.format);
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

describe("a masked JSON frame stays valid JSON", () => {
  const json = (credentials: string[], frame: string) =>
    new CredentialMask(credentials).json(frame);

  it("masks a credential whose slash a carried JSON document writes as \\/", () => {
    const body = '{"key":"service\\/key"}';
    const frame = JSON.stringify({ body });
    const masked = json(["service/key"], frame);
    expect(JSON.parse(masked)).toEqual({ body: '{"key":"********"}' });
    expect(new CredentialMask(["service/key"]).text(`provider said ${body}`)).toBe(
      'provider said {"key":"********"}',
    );
    const clean = JSON.stringify({ body: '{"key":"other\\/value"}' });
    expect(json(["service/key"], clean)).toBe(clean);
  });

  it("masks a credential inside a string value or key, and encodes the string again", () => {
    const frame = JSON.stringify({ [`k-${API_KEY}`]: `v ${API_KEY} v`, other: "x" });
    const masked = json([API_KEY], frame);
    expect(JSON.parse(masked)).toEqual({ "k-********": "v ******** v", other: "x" });
  });

  it.each(["90000", "true", "false", "null", "-1.5e3"])(
    "turns a %s token equal to a credential into the masked string",
    (credential) => {
      const frame = `{"a":${credential},"b":[${credential}, 7]}`;
      const masked = json([credential], frame);
      expect(JSON.parse(masked)).toEqual({ a: "********", b: ["********", 7] });
    },
  );

  it("writes a frame without a credential byte for byte", () => {
    const frame =
      '{\n  "big": 123456789012345678901234567890,\n  "f": 1.50,\t"s": "a\\u00e9\\/b"\n}';
    expect(json([API_KEY, "90000"], frame)).toBe(frame);
  });

  it.each([
    ["n", { n: "network", list: [null, "none"] }],
    ['"', { q: 'say "hi"', plain: "x" }],
    ["\\", { path: "a\\b", plain: "x" }],
    ["clé-é", { k: "the clé-é here", e: "é" }],
  ])("keeps the frame valid with the credential %j", (credential, value) => {
    const masked = json([credential], JSON.stringify(value, null, 2));
    const strings = (v: unknown): string[] =>
      typeof v === "string"
        ? [v]
        : Array.isArray(v)
          ? v.flatMap(strings)
          : typeof v === "object" && v !== null
            ? Object.entries(v).flatMap(([k, x]) => [k, ...strings(x)])
            : [];
    const found = strings(JSON.parse(masked));
    expect(found.length).toBeGreaterThan(0);
    for (const text of found) expect(text).not.toContain(credential);
  });

  it("keeps an error envelope valid", () => {
    const credential = "n";
    const { sm, out } = streams("json", [credential]);
    createOutputFormatter("json", sm, 0).error(
      new ExecutionError("rpc_error", "node answered no", { txId: "n" } as never),
    );
    const envelope = JSON.parse(out.join("")) as { error: { message: string } };
    expect(envelope.error.message).not.toContain("n");
  });
});

describe("an error value written on one line", () => {
  it.each([
    ["U+0085", "pre\u0085post-cred"],
    ["U+2028", "pre post-cred"],
  ])("is masked with a credential holding %s", (_name, credential) => {
    const error = () =>
      new ExecutionError("provider_error", errorMessage`provider echoed ${credential}`, {
        txId: credential,
      });
    for (const mode of ["json", "text"] as const) {
      const { sm, all } = streams(mode, [credential]);
      createOutputFormatter(mode, sm, 0).error(error());
      const written = all();
      expect(written).toContain("provider echoed ********");
      expect(written).not.toContain("post-cred");
      if (mode === "json") expect(() => JSON.parse(written) as unknown).not.toThrow();
    }
  });
});

describe("a numeric credential in real commands", () => {
  async function run(args: string[]): Promise<{ code: number; out: string }> {
    const home = mkdtempSync(join(tmpdir(), "wcli-numeric-"));
    const configPath = join(home, "config.yaml");
    writeFileSync(configPath, `tronlinkSecretId: "90000"\n`);
    chmodSync(configPath, 0o600);
    const previous = process.env.WALLET_CLI_HOME;
    process.env.WALLET_CLI_HOME = home;
    const out: string[] = [];
    const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      out.push(String(chunk));
      return true;
    });
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const code = await main(["node", "wallet-cli", ...args]);
      return { code, out: out.join("") };
    } finally {
      outSpy.mockRestore();
      errSpy.mockRestore();
      if (previous === undefined) delete process.env.WALLET_CLI_HOME;
      else process.env.WALLET_CLI_HOME = previous;
    }
  }

  it.each([[["config", "timeoutMs", "-o", "json"]], [["--json-schema"]]])(
    "keeps %j output valid JSON without the value",
    async (args) => {
      const { code, out } = await run(args);
      expect(code).toBe(0);
      expect(() => JSON.parse(out) as unknown).not.toThrow();
      expect(out).not.toContain("90000");
    },
  );
});

describe("the last-resort report after the runtime is composed", () => {
  it("masks configured credentials", async () => {
    const home = mkdtempSync(join(tmpdir(), "wcli-fatal-"));
    const configPath = join(home, "config.yaml");
    writeFileSync(configPath, `tronlinkSecretId: ${API_KEY}\n`);
    chmodSync(configPath, 0o600);
    const previous = process.env.WALLET_CLI_HOME;
    process.env.WALLET_CLI_HOME = home;
    const written: string[] = [];
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
    const helpSpy = vi.spyOn(HelpService.prototype, "handleMeta").mockImplementation(() => {
      throw new Error("first");
    });
    // The runner's own error handling fails too, so the failure escapes to the last-resort report.
    const diagnosticSpy = vi.spyOn(StreamManager.prototype, "diagnostic").mockImplementation(() => {
      throw new Error(`fatal ${API_KEY}`);
    });
    const sink = { on: () => sink, write: (_s: string, done?: () => void) => done?.() };
    let exitCode: number | undefined;
    try {
      await runProcess(["node", "wallet-cli", "--help"], {
        stdout: sink as never,
        stderr: sink as never,
        exit: (code) => (exitCode = code),
      });
      expect(exitCode).toBe(1);
      expect(written.join("")).toContain("fatal: fatal ********");
      expect(written.join("")).not.toContain(API_KEY);
    } finally {
      diagnosticSpy.mockRestore();
      helpSpy.mockRestore();
      errSpy.mockRestore();
      if (previous === undefined) delete process.env.WALLET_CLI_HOME;
      else process.env.WALLET_CLI_HOME = previous;
    }
  });
});
