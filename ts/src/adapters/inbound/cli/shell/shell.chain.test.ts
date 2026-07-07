import { describe, it, expect, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { buildCli, type ShellOptions } from "./index.js";
import type { ChainSpec, SessionRef } from "../contracts/index.js";
import { CommandRegistry } from "../registry/index.js";
import { CapabilityRegistry } from "../../../../application/services/capability/index.js";
import { TargetResolver } from "../../../../application/services/target/index.js";
import { StreamManager } from "../stream/index.js";
import { createOutputFormatter } from "../output/index.js";
import { ConfigLoader, NetworkRegistry } from "../../../outbound/config/index.js";
import { AtomicFileStore } from "../../../outbound/persistence/fs/index.js";
import { Keystore } from "../../../outbound/keystore/index.js";
import { SecretResolver } from "../input/secret/index.js";
import { Prompter } from "../input/prompt/index.js";

describe("ChainCommandDefinition dispatch", () => {
  it("routes a positional through the selected family binding", async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), "wallet-cli-chain-test-"));
    const store = new AtomicFileStore();
    const backend = {
      isTTY: () => false,
      async question() { return ""; },
      async readKey() { return { name: "return" }; },
      write() {},
      beginRaw() {},
      endRaw() {},
    };
    const prompter = new Prompter(backend);
    const out: string[] = [];
    const streams = new StreamManager("json", false, (s) => out.push(s));
    const secrets = new SecretResolver(streams, {}, prompter);
    const keystore = new Keystore(tmpRoot, store, () => secrets.masterPassword());
    const config = ConfigLoader.load();
    const networkRegistry = new NetworkRegistry(config);
    const formatter = createOutputFormatter("json", streams, Date.now());
    const registry = new CommandRegistry();
    const spec: ChainSpec = {
      path: ["block"],
      network: "optional",
      wallet: "none",
      auth: "none",
      positionals: [{ field: "number" }],
      examples: [],
      baseFields: z.object({ number: z.string().optional() }),
    };
    const run = vi.fn(async (_ctx, _net, input) => ({ block: { number: input.number } }));
    registry.addChain(spec, "tron", { run });

    const globals = { output: "json" as const, verbose: false, network: "tron:mainnet" };
    const deps = { config, networkRegistry, streams, secrets, keystore, prompter, formatter };
    const shellOpts: ShellOptions = {
      registry,
      globals,
      deps,
      targetResolver: new TargetResolver({ networkRegistry, keystore }),
      caps: new CapabilityRegistry(),
      streams,
      formatter,
      session: {} as SessionRef,
    };

    await buildCli(shellOpts).parseAsync(["block", "123"]);

    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0]![2]).toMatchObject({ number: "123" });
    expect(JSON.parse(out[0]!).data).toEqual({ block: { number: "123" } });
  });
});
