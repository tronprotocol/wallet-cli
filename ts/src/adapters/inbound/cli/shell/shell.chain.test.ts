import { describe, it, expect, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { buildCli, type ShellOptions } from "./index.js";
import type { ChainSpec, CommandDefinition, SessionRef } from "../contracts/index.js";
import { CommandRegistry } from "../registry/index.js";
import { CapabilityRegistry } from "../../../../application/services/capability/index.js";
import { TargetResolver } from "../../../../application/services/target/index.js";
import { StreamManager } from "../stream/index.js";
import { createOutputFormatter } from "../output/index.js";
import { ConfigLoader, NetworkRegistry } from "../../../outbound/config/index.js";
import { AtomicFileStore } from "../../../outbound/persistence/fs/index.js";
import { Keystore } from "../../../outbound/keystore/index.js";
import { WalletService } from "../../../../application/use-cases/wallet-service.js";
import { SecretResolver } from "../input/secret/index.js";
import { Prompter } from "../input/prompt/index.js";
import { assertBroadcastAllowed } from "../../../../application/services/broadcast-guard.js";
import { CommandDeadline } from "../../../../application/services/command-deadline.js";
import { blockSpec } from "../commands/block.js";

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
    const accounts = new WalletService(keystore, {} as never, {} as never, {} as never);
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

    const globals = { output: "json" as const, verbose: false, network: "tron:728126428" };
    const deps = {
      config,
      deadline: new CommandDeadline(0),
      networkRegistry,
      streams,
      secrets,
      accounts,
      prompter,
      formatter,
    };
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
    const accounts = new WalletService(keystore, {} as never, {} as never, {} as never);
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

    const globals = { output: "json" as const, verbose: false, network: "tron:728126428" };
    const deps = {
      config,
      deadline: new CommandDeadline(0),
      networkRegistry,
      streams,
      secrets,
      accounts,
      prompter,
      formatter,
    };
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
    const accounts = new WalletService(keystore, {} as never, {} as never, {} as never);
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
        globals: { output: "json" as const, verbose: false, network: "tron:728126428" },
        deps: {
          config,
          deadline: new CommandDeadline(0),
          networkRegistry,
          streams,
          secrets,
          accounts,
          prompter,
          formatter,
        },
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
    // yargs emits both spellings; report the offending flag once.
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

describe("--dry-run bars broadcasting", () => {
  function dryRunFixture(
    run: (input: any) => Promise<unknown>,
    shape: "chain" | "chain-without-broadcasts" | "neutral" = "chain",
  ) {
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
    const accounts = new WalletService(keystore, {} as never, {} as never, {} as never);
    const config = ConfigLoader.load();
    const networkRegistry = new NetworkRegistry(config);
    const formatter = createOutputFormatter("json", streams, Date.now());
    const registry = new CommandRegistry();
    const fields = z.object({ dryRun: z.boolean().default(false) });
    if (shape === "neutral") {
      registry.add({
        path: ["tx", "broadcast"],
        network: "optional",
        wallet: "none",
        auth: "none",
        fields,
        input: fields,
        examples: [],
        run: async (_ctx: any, _net: any, input: any) => run(input),
      } as unknown as CommandDefinition);
    } else {
      registry.addChain(
        {
          path: ["tx", "broadcast"],
          network: "optional",
          wallet: "none",
          auth: "none",
          ...(shape === "chain" ? { broadcasts: true } : {}),
          examples: [],
          baseFields: fields,
        },
        "tron",
        { run: async (_ctx: any, _net: any, input: any) => run(input) },
      );
    }
    const globals = { output: "json" as const, verbose: false, network: "tron:728126428" };
    const deps = {
      config,
      deadline: new CommandDeadline(0),
      networkRegistry,
      streams,
      secrets,
      accounts,
      prompter,
      formatter,
    };
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

  it.each(["chain-without-broadcasts", "neutral"] as const)(
    "stops a %s command that submits during --dry-run",
    async (shape) => {
      const submitted: string[] = [];
      const { shellOpts } = dryRunFixture(async () => {
        assertBroadcastAllowed();
        submitted.push("sent");
        return { stage: "submitted" };
      }, shape);

      await expect(
        buildCli(shellOpts).parseAsync(["tx", "broadcast", "--dry-run"]),
      ).rejects.toMatchObject({ code: "dry_run_violation" });
      expect(submitted).toEqual([]);
    },
  );

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

describe("block positional", () => {
  function blockShell() {
    const tmpRoot = mkdtempSync(join(tmpdir(), "wallet-cli-block-test-"));
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
    });
    const streams = new StreamManager("json", false, () => {});
    const secrets = new SecretResolver(streams, {}, prompter);
    const keystore = new Keystore(tmpRoot, new AtomicFileStore(), () => secrets.masterPassword());
    const config = ConfigLoader.load();
    const networkRegistry = new NetworkRegistry(config);
    const formatter = createOutputFormatter("json", streams, Date.now());
    const registry = new CommandRegistry();
    const run = vi.fn(async () => ({}));
    registry.addChain(blockSpec, "tron", { run });
    const cli = buildCli({
      registry,
      globals: { output: "json" as const, verbose: false, network: "tron:728126428" },
      deps: {
        config,
        deadline: new CommandDeadline(0),
        networkRegistry,
        streams,
        secrets,
        accounts: new WalletService(keystore, {} as never, {} as never, {} as never),
        prompter,
        formatter,
      },
      targetResolver: new TargetResolver({ networkRegistry, keystore }),
      caps: new CapabilityRegistry(),
      streams,
      formatter,
      session: {} as SessionRef,
    });
    return { cli, run };
  }

  it.each(["abc", "0x10", "1.5"])(
    "rejects %s as an invalid block number without a request",
    async (pos) => {
      const { cli, run } = blockShell();
      await expect(cli.parseAsync(["block", pos])).rejects.toMatchObject({
        code: "invalid_value",
        message: expect.stringContaining("<number>"),
      });
      expect(run).not.toHaveBeenCalled();
    },
  );
});
