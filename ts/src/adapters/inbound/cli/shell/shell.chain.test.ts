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
import { assertBroadcastAllowed } from "../../../../application/services/broadcast-guard.js";

describe("ChainCommandDefinition dispatch", () => {
  it("routes a positional through the selected family binding", async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), "wallet-cli-chain-test-"));
    const store = new AtomicFileStore();
    const backend = {
      isTTY: () => false,
      async question() {
        return "";
      },
      async readKey() {
        return { name: "return" };
      },
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

  it("binds positional arguments declared by a grouped leaf command", async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), "wallet-cli-group-position-test-"));
    const store = new AtomicFileStore();
    const backend = {
      isTTY: () => false,
      async question() {
        return "";
      },
      async readKey() {
        return { name: "return" };
      },
      write() {},
      beginRaw() {},
      endRaw() {},
    };
    const prompter = new Prompter(backend);
    const out: string[] = [];
    const streams = new StreamManager("json", false, (value) => out.push(value));
    const secrets = new SecretResolver(streams, {}, prompter);
    const keystore = new Keystore(tmpRoot, store, () => secrets.masterPassword());
    const config = ConfigLoader.load();
    const networkRegistry = new NetworkRegistry(config);
    const formatter = createOutputFormatter("json", streams, Date.now());
    const registry = new CommandRegistry();
    const run = vi.fn(async (_ctx, _net, input) => ({ proposal: input.id }));
    registry.addChain(
      {
        path: ["proposal", "show"],
        network: "optional",
        wallet: "none",
        auth: "none",
        positionals: [{ field: "id" }],
        examples: [],
        baseFields: z.object({ id: z.coerce.number().int().positive() }),
      },
      "tron",
      { run },
    );

    const globals = { output: "json" as const, verbose: false, network: "tron:mainnet" };
    const deps = { config, networkRegistry, streams, secrets, keystore, prompter, formatter };
    await buildCli({
      registry,
      globals,
      deps,
      targetResolver: new TargetResolver({ networkRegistry, keystore }),
      caps: new CapabilityRegistry(),
      streams,
      formatter,
      session: {} as SessionRef,
    }).parseAsync(["proposal", "show", "47"]);

    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0]![2]).toMatchObject({ id: 47 });
    expect(JSON.parse(out[0]!).data).toEqual({ proposal: 47 });
  });
});

// executeChainCommand is a second, independent dispatch path: it binds positionals and rejects
// flagged ones at its own call site. A `<group> <verb> [args..]` chain leaf exercises the grouped
// tail there, which the single-segment `block` case above does not reach.
describe("grouped chain leaf positionals", () => {
  function chainFixture(_tokens: string[]) {
    const tmpRoot = mkdtempSync(join(tmpdir(), "wallet-cli-chain-test-"));
    const prompter = new Prompter({
      isTTY: () => false,
      async question() {
        return "";
      },
      async readKey() {
        return { name: "return" };
      },
      write() {},
      beginRaw() {},
      endRaw() {},
    } as any);
    const out: string[] = [];
    const streams = new StreamManager("json", false, (s) => out.push(s));
    const secrets = new SecretResolver(streams, {}, prompter);
    const keystore = new Keystore(tmpRoot, new AtomicFileStore(), () => secrets.masterPassword());
    const config = ConfigLoader.load();
    const networkRegistry = new NetworkRegistry(config);
    const formatter = createOutputFormatter("json", streams, Date.now());

    const registry = new CommandRegistry();
    const spec: ChainSpec = {
      path: ["gasfree", "trace"],
      network: "optional",
      wallet: "none",
      auth: "none",
      positionals: [{ field: "traceId" }],
      examples: [],
      baseFields: z.object({ traceId: z.string().optional() }),
    };
    const run = vi.fn(async (_ctx: any, _net: any, input: any) => ({ traceId: input.traceId }));
    registry.addChain(spec, "tron", { run });
    // sibling leaf → the head is dispatched as `gasfree [verb] [args..]`
    registry.addChain(
      {
        path: ["gasfree", "info"],
        network: "optional",
        wallet: "none",
        auth: "none",
        examples: [],
        baseFields: z.object({}),
      },
      "tron",
      { run: async () => ({}) },
    );

    return {
      run,
      shellOpts: {
        registry,
        globals: { output: "json" as const, verbose: false, network: "tron:mainnet" },
        deps: { config, networkRegistry, streams, secrets, keystore, prompter, formatter },
        targetResolver: new TargetResolver({ networkRegistry, keystore }),
        caps: new CapabilityRegistry(),
        streams,
        formatter,
        session: {} as SessionRef,
      } satisfies ShellOptions,
    };
  }

  it("passes a numeric-looking positional through verbatim as a string", async () => {
    const tokens = ["gasfree", "trace", "12345"];
    const { shellOpts, run } = chainFixture(tokens);
    await buildCli(shellOpts).parseAsync(tokens);
    expect(run.mock.calls[0]![2]).toMatchObject({ traceId: "12345" });
  });

  it("rejects the --<field> spelling, matching the kebab form of a camelCase field", async () => {
    const tokens = ["gasfree", "trace", "--trace-id", "12345"];
    const { shellOpts, run } = chainFixture(tokens);
    // exactly once: camel-case-expansion lands both spellings in argv, they must not double-report
    await expect(buildCli(shellOpts).parseAsync(tokens)).rejects.toMatchObject({
      code: "invalid_option",
      message: "unknown option(s): --trace-id",
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects the camelCase spelling too", async () => {
    const tokens = ["gasfree", "trace", "--traceId", "12345"];
    const { shellOpts } = chainFixture(tokens);
    await expect(buildCli(shellOpts).parseAsync(tokens)).rejects.toMatchObject({
      code: "invalid_option",
      message: /unknown option\(s\): --trace-id/,
    });
  });
});

/**
 * The shell's half of the dry-run guarantee.
 *
 * A family binding is free to forget `--dry-run` — the flag lives on the shared spec and each
 * binding decides what to forward — so the shell bars broadcasting for the duration of the run.
 * The binding below is exactly the mistake being defended against: it ignores the flag and
 * broadcasts anyway.
 */
describe("--dry-run bars broadcasting", () => {
  function dryRunFixture(run: (input: any) => Promise<unknown>) {
    const tmpRoot = mkdtempSync(join(tmpdir(), "wallet-cli-dryrun-test-"));
    const prompter = new Prompter({
      isTTY: () => false,
      async question() {
        return "";
      },
      async readKey() {
        return { name: "return" };
      },
      write() {},
      beginRaw() {},
      endRaw() {},
    } as any);
    const out: string[] = [];
    const streams = new StreamManager("json", false, (s) => out.push(s));
    const secrets = new SecretResolver(streams, {}, prompter);
    const keystore = new Keystore(tmpRoot, new AtomicFileStore(), () => secrets.masterPassword());
    const config = ConfigLoader.load();
    const networkRegistry = new NetworkRegistry(config);
    const formatter = createOutputFormatter("json", streams, Date.now());
    const registry = new CommandRegistry();
    registry.addChain(
      {
        path: ["tx", "broadcast"],
        network: "optional",
        wallet: "none",
        auth: "none",
        broadcasts: true,
        examples: [],
        baseFields: z.object({ dryRun: z.boolean().default(false) }),
      },
      "tron",
      { run: async (_ctx: any, _net: any, input: any) => run(input) },
    );
    const globals = { output: "json" as const, verbose: false, network: "tron:mainnet" };
    const deps = { config, networkRegistry, streams, secrets, keystore, prompter, formatter };
    return {
      out,
      shellOpts: {
        registry,
        globals,
        deps,
        targetResolver: new TargetResolver({ networkRegistry, keystore }),
        caps: new CapabilityRegistry(),
        streams,
        formatter,
        session: {} as SessionRef,
      } as ShellOptions,
    };
  }

  it("stops a binding that ignores the flag and broadcasts anyway", async () => {
    const submitted: string[] = [];
    const { shellOpts } = dryRunFixture(async () => {
      assertBroadcastAllowed();
      submitted.push("sent");
      return { stage: "submitted" };
    });

    await expect(
      buildCli(shellOpts).parseAsync(["tx", "broadcast", "--dry-run"]),
    ).rejects.toMatchObject({ code: "dry_run_violation" });
    expect(submitted).toEqual([]);
  });

  it("leaves a real broadcast alone", async () => {
    const submitted: string[] = [];
    const { shellOpts } = dryRunFixture(async () => {
      assertBroadcastAllowed();
      submitted.push("sent");
      return { stage: "submitted" };
    });

    await buildCli(shellOpts).parseAsync(["tx", "broadcast"]);

    expect(submitted).toEqual(["sent"]);
  });
});
