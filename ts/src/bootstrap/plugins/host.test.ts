import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { CommandRegistry } from "../../adapters/inbound/cli/registry/index.js";
import { CapabilityRegistry } from "../../application/services/capability/index.js";
import { errorCodeEntry, ErrorCodeTable } from "../../domain/errors/codes.js";
import type { ExecutionContext } from "../../adapters/inbound/cli/contracts/index.js";
import type { NetworkDescriptor } from "../../domain/types/index.js";
import {
  PLUGIN_API_REVISION,
  PLUGIN_API_VERSION,
  type PluginDefinition,
  type PluginHost,
} from "../../plugin-sdk/index.js";
import type { HostServices } from "../../plugin-sdk/host-services.js";
import type { PluginChainSpec } from "../../plugin-sdk/cli.js";
import { hostServices, pluginCommandContext, registerPlugin, type PluginTargets } from "./host.js";

// A plugin reads its service credentials when it registers.
const SERVICES = { config: { credential: () => undefined } } as unknown as HostServices;

const NETWORKS = [
  { id: "tron:1", family: "tron", chainId: "1", nativeSymbol: "TRX", capabilities: [] },
  { id: "tron:2", family: "tron", chainId: "2", nativeSymbol: "TRX", capabilities: [] },
] as NetworkDescriptor[];

function targets(): PluginTargets & {
  commands: CommandRegistry;
  capabilities: CapabilityRegistry;
} {
  const commands = new CommandRegistry();
  commands.addChain(spec(["tx", "send"]), "tron", { run: async () => ({}) });
  return {
    commands,
    capabilities: new CapabilityRegistry(),
    errorCodes: new ErrorCodeTable(),
    networks: NETWORKS,
    services: SERVICES,
  };
}

// Everything a registration can change, for comparing before and after.
function contents(t: PluginTargets & { capabilities: CapabilityRegistry }) {
  return {
    commands: t.commands.all().map((c) => ("spec" in c ? c.spec.path : c.path).join(" ")),
    groups: t.commands.groups().map((g) => g.name),
    codes: Object.keys(t.errorCodes.table()).length,
    predicate: t.capabilities.hasPredicate("demo.read"),
  };
}

function spec(path: string[]): PluginChainSpec {
  return {
    path,
    network: "optional",
    wallet: "none",
    auth: "none",
    baseFields: z.object({}),
    examples: [],
  };
}

function plugin(register: (host: PluginHost) => void, overrides: Partial<PluginDefinition> = {}) {
  return {
    name: "demo",
    version: "1.0.0",
    apiVersion: PLUGIN_API_VERSION,
    apiRevision: PLUGIN_API_REVISION,
    groups: [{ name: "demo", summary: "Demo commands", families: ["tron"] }],
    register,
    ...overrides,
  } satisfies PluginDefinition;
}

const run = async () => ({});
const ENTRY = { exit: 1, retry: "never", meaning: "a demo failure" } as const;

describe("registerPlugin", () => {
  it("publishes every declaration of a plugin", () => {
    const t = targets();
    const result = registerPlugin(
      plugin((host) => {
        host.chainCommand(spec(["demo", "show"]), "tron", { run });
        host.errorCodes({ demo_publish_failed: ENTRY });
        host.capabilities({ "demo.read": () => "unsupported" });
      }),
      t,
    );
    expect(result).toEqual({ ok: true });
    expect(t.commands.resolveChain(["demo", "show"])).not.toBeNull();
    expect(t.commands.group("demo")?.summary).toBe("Demo commands");
    expect(t.errorCodes.entry("demo_publish_failed")).toEqual(ENTRY);
    expect(Object.keys(t.errorCodes.table()).at(-1)).toBe("demo_publish_failed");
    expect(errorCodeEntry("demo_publish_failed")).toBeUndefined();
    expect(t.capabilities.hasPredicate("demo.read")).toBe(true);
  });

  it("refuses a command outside the plugin's groups", () => {
    const t = targets();
    const result = registerPlugin(
      plugin((host) => host.chainCommand(spec(["other", "show"]), "tron", { run })),
      t,
    );
    expect(result).toMatchObject({
      ok: false,
      reason: expect.stringContaining("outside its groups"),
    });
    expect(t.commands.resolveChain(["other", "show"])).toBeNull();
  });

  it("refuses a capability key that does not start with the plugin or a group name", () => {
    const t = targets();
    const result = registerPlugin(
      plugin((host) => host.capabilities({ "demolition.read": () => "supported" }), {
        name: "demo-plugin",
      }),
      t,
    );
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining("demolition.read") });
    expect(
      registerPlugin(
        plugin((host) => host.capabilities({ "demo-plugin.read": () => "supported" }), {
          name: "demo-plugin",
        }),
        targets(),
      ),
    ).toEqual({ ok: true });
  });

  it("refuses an error code already defined with a different entry, and accepts the same entry", () => {
    const changed = registerPlugin(
      plugin((host) => host.errorCodes({ timeout: { ...ENTRY } })),
      targets(),
    );
    expect(changed).toMatchObject({ ok: false, reason: expect.stringContaining("timeout") });
    expect(errorCodeEntry("timeout")?.meaning).not.toBe(ENTRY.meaning);
    const same = registerPlugin(
      plugin((host) => host.errorCodes({ timeout: errorCodeEntry("timeout")! })),
      targets(),
    );
    expect(same).toEqual({ ok: true });
  });

  it.each([["tx"], ["tron"], ["plugin"]])("refuses the group name %s", (word) => {
    const t = targets();
    const result = registerPlugin(
      plugin(() => {}, { groups: [{ name: word, summary: "taken", families: [] }] }),
      t,
    );
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining(`"${word}"`) });
    expect(t.commands.group(word)).toBeUndefined();
  });

  it("refuses a group another plugin already uses", () => {
    const t = targets();
    expect(
      registerPlugin(
        plugin(() => {}),
        t,
      ),
    ).toEqual({ ok: true });
    expect(
      registerPlugin(
        plugin(() => {}, { name: "second" }),
        t,
      ),
    ).toMatchObject({ ok: false });
    expect(t.commands.groups().map((g) => g.name)).toEqual(["demo"]);
  });

  it("leaves nothing behind when a plugin fails after one successful declaration", () => {
    const t = targets();
    const result = registerPlugin(
      plugin((host) => {
        host.chainCommand(spec(["demo", "show"]), "tron", { run });
        host.errorCodes({ demo_partial_failed: ENTRY });
        host.capabilities({ "demo.partial": () => "supported" });
        throw new Error("register failed");
      }),
      t,
    );
    expect(result).toEqual({ ok: false, reason: "register failed" });
    expect(t.commands.resolveChain(["demo", "show"])).toBeNull();
    expect(t.commands.groups()).toEqual([]);
    expect(t.errorCodes.entry("demo_partial_failed")).toBeUndefined();
    expect(t.capabilities.hasPredicate("demo.partial")).toBe(false);
  });

  it("fails a plugin that catches a refused declaration, and stages no part of a refused batch", () => {
    const t = targets();
    const before = contents(t);
    const result = registerPlugin(
      plugin((host) => {
        host.chainCommand(spec(["demo", "show"]), "tron", { run });
        host.capabilities({ "demo.read": () => "supported" });
        try {
          host.errorCodes({ demo_caught: ENTRY, timeout: { ...ENTRY } });
        } catch {
          // the plugin ignores the refusal
        }
      }),
      t,
    );
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining("timeout") });
    expect(contents(t)).toEqual(before);
    expect(t.errorCodes.entry("demo_caught")).toBeUndefined();
  });

  it("publishes what the plugin declared, not what it changed afterwards", () => {
    const t = targets();
    const path = ["demo", "first"];
    const shared = spec(["demo", "chain"]);
    const result = registerPlugin(
      plugin((host) => {
        host.command({ path, network: "none", schema: z.object({}), examples: [], run } as never);
        path[1] = "second";
        host.command({ path, network: "none", schema: z.object({}), examples: [], run } as never);
        host.chainCommand(shared, "tron", { run });
        host.chainCommand(shared, "evm", { run });
        shared.path[1] = "moved";
        (shared as { passwordMode?: string }).passwordMode = "verify";
      }),
      t,
    );
    expect(result).toEqual({ ok: true });
    expect(t.commands.resolveNeutral(["demo", "first"])).not.toBeNull();
    expect(t.commands.resolveNeutral(["demo", "second"])).not.toBeNull();
    const chain = t.commands.resolveChain(["demo", "chain"])!;
    expect(Object.keys(chain.families)).toEqual(["tron", "evm"]);
    expect(chain.spec.path).toEqual(["demo", "chain"]);
    expect("passwordMode" in chain.spec).toBe(false);
  });

  it("refuses a wallet-management field the declaration inherits", () => {
    const inherited = Object.assign(Object.create({ passwordMode: "verify" }), spec(["demo", "x"]));
    expect(
      registerPlugin(
        plugin((host) => host.chainCommand(inherited, "tron", { run })),
        targets(),
      ),
    ).toMatchObject({ ok: false, reason: expect.stringContaining("passwordMode") });
  });

  it("publishes nothing when the target registry refuses the batch", () => {
    const t = targets();
    t.commands.add({ path: ["demo", "show"], run } as never);
    const before = contents(t);
    const result = registerPlugin(
      plugin((host) => {
        host.errorCodes({ demo_refused: ENTRY });
        host.command({ path: ["demo", "show"], examples: [], run } as never);
      }),
      // Taken words are checked against the group; the command path is only found by the target.
      { ...t, commands: Object.assign(t.commands, { topLevelWords: () => new Set<string>() }) },
    );
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining("demo.show") });
    expect(contents(t)).toEqual(before);
  });

  it("fails a plugin whose predicate throws on a configured network, and keeps the others", () => {
    const t = targets();
    const result = registerPlugin(
      plugin((host) => {
        host.chainCommand(spec(["demo", "show"]), "tron", { run });
        host.capabilities({
          "demo.read": (network) => {
            if (network.id === "tron:2") throw new Error("bad demo block");
            return "supported";
          },
        });
      }),
      t,
    );
    expect(result).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/demo\.read failed on tron:2: bad demo block/),
    });
    expect(t.commands.groups()).toEqual([]);
    expect(t.capabilities.hasPredicate("demo.read")).toBe(false);
    expect(t.commands.resolveChain(["tx", "send"])).not.toBeNull();
    expect(
      registerPlugin(
        plugin(() => {}, { name: "other" }),
        t,
      ),
    ).toEqual({ ok: true });
  });

  it("evaluates a plugin predicate once per network and records its result", () => {
    const t = targets();
    const predicate = vi.fn(() => "needs-inputs" as const);
    registerPlugin(
      plugin((host) => host.capabilities({ "demo.read": predicate })),
      t,
    );
    for (const network of NETWORKS) t.capabilities.register(network, ["demo.read"]);
    expect(predicate).toHaveBeenCalledTimes(NETWORKS.length);
    expect(t.capabilities.support("tron:1", "demo.read")).toBe("needs-inputs");
  });

  it("keeps each runtime's codes to itself", () => {
    const declare = () => plugin((host) => host.errorCodes({ demo_runtime: ENTRY }));
    const a = targets();
    const b = targets();
    expect(registerPlugin(declare(), a)).toEqual({ ok: true });
    expect(b.errorCodes.entry("demo_runtime")).toBeUndefined();
    expect(registerPlugin(declare(), b)).toEqual({ ok: true });
    expect(b.errorCodes.entry("demo_runtime")).toEqual(ENTRY);
  });

  it("refuses wallet-management fields, unsupported API numbers and late declarations", () => {
    expect(
      registerPlugin(
        plugin((host) =>
          host.chainCommand({ ...spec(["demo", "x"]), passwordMode: "verify" } as never, "tron", {
            run,
          }),
        ),
        targets(),
      ),
    ).toMatchObject({ ok: false, reason: expect.stringContaining("passwordMode") });
    expect(
      registerPlugin(
        plugin(() => {}, { apiVersion: 2 }),
        targets(),
      ),
    ).toMatchObject({
      ok: false,
    });
    expect(
      registerPlugin(
        plugin(() => {}, { apiRevision: PLUGIN_API_REVISION + 1 }),
        targets(),
      ),
    ).toMatchObject({ ok: false });
    let kept: PluginHost | undefined;
    registerPlugin(
      plugin((host) => (kept = host)),
      targets(),
    );
    expect(() => kept!.errorCodes({ demo_late: ENTRY })).toThrow(/after its registration/);
  });

  it("runs a plugin command with the plugin context instead of the execution context", async () => {
    const t = targets();
    const seen = vi.fn(async (ctx: object) => Object.keys(ctx));
    registerPlugin(
      plugin((host) => host.chainCommand(spec(["demo", "show"]), "tron", { run: seen })),
      t,
    );
    const ctx = executionContext();
    const result = await t.commands
      .resolveChain(["demo", "show"])!
      .families.tron!.run(ctx, {} as NetworkDescriptor, {});
    expect(result).toEqual(CONTEXT_MEMBERS);
  });
});

const CONTEXT_MEMBERS = [
  "deadline",
  "activeAccount",
  "resolveAddress",
  "wait",
  "emit",
  "warn",
  "readStdinBytes",
];

function executionContext(secrets: string[] = []): ExecutionContext {
  return {
    deadline: {
      signal: new AbortController().signal,
      remainingMs: () => 1,
      expired: () => false,
      assertActive: () => {},
      dispose: () => {},
    },
    activeAccount: "wlt_a",
    resolveAddress: () => "TADDR",
    wait: undefined,
    emit: vi.fn(),
    warn: vi.fn(),
    output: "json",
    config: {},
    networkRegistry: {},
    streams: {
      errorLine: vi.fn(),
      diagnostic: vi.fn(),
      readStdinBytesOnce: vi.fn(async () => new Uint8Array([1])),
    },
    secrets: { has: (kind: string) => secrets.includes(kind), masterPassword: () => "pw" },
    prompt: {},
  } as unknown as ExecutionContext;
}

// Everything a plugin can reach on an object, own and inherited.
function reachable(value: object): string[] {
  const names: string[] = [];
  for (let o: object | null = value; o !== null; o = Object.getPrototypeOf(o)) {
    names.push(...Object.getOwnPropertyNames(o), ...Object.getOwnPropertySymbols(o).map(String));
  }
  return names;
}

describe("the lifetime log", () => {
  function lifetimeLog(output: "text" | "json") {
    const streams = { errorLine: vi.fn(), diagnostic: vi.fn() };
    const services = hostServices({
      lifetime: { keepAlive: vi.fn() },
      streams,
      output,
      config: { credentials: new Map() },
    } as never);
    return { log: services.lifetime.log, streams };
  }

  it("writes the text of a record in text mode", () => {
    const { log, streams } = lifetimeLog("text");
    log.record("Payment required: HTTP 402 (1 ms)", { status: 402 });
    expect(streams.errorLine.mock.calls).toEqual([["Payment required: HTTP 402 (1 ms)"]]);
  });

  it("writes the data of a record as one JSON line in JSON mode", () => {
    const { log, streams } = lifetimeLog("json");
    log.record("ignored", { event: "x402.request", status: 402, durationMs: 0 });
    expect(streams.errorLine.mock.calls).toEqual([
      ['{"event":"x402.request","status":402,"durationMs":0}'],
    ]);
  });

  it("hands diagnostics to the diagnostic stream at their level", () => {
    const { log, streams } = lifetimeLog("json");
    log.diagnostic("debug", "line");
    expect(streams.diagnostic.mock.calls).toEqual([["debug", "line"]]);
    expect(streams.errorLine).not.toHaveBeenCalled();
  });
});

describe("objects handed to a plugin", () => {
  it("keep the started child behind the detached start facade", () => {
    const raw = Object.assign(new EventEmitter(), {
      pid: 7,
      connected: true,
      disconnect: vi.fn(() => raw),
      unref: vi.fn(() => raw),
      kill: vi.fn(() => true),
    });
    const services = hostServices({
      lifetime: { keepAlive: vi.fn() },
      launcher: { startDetached: () => raw },
      streams: { errorLine: vi.fn(), diagnostic: vi.fn() },
      output: "json",
      config: { credentials: new Map() },
    } as never);
    const child = services.lifetime.startDetached({ argv: [], env: {}, stderr: 2 });
    const calls: { receiver: unknown; args: unknown[] }[] = [];
    function listener(this: unknown, ...args: unknown[]) {
      calls.push({ receiver: this, args });
    }

    expect(child.on("message", listener)).toBeUndefined();
    raw.emit("message", { ready: true }, "handle");
    expect(calls).toEqual([{ receiver: undefined, args: [{ ready: true }] }]);
    expect(child.off("message", listener)).toBeUndefined();
    raw.emit("message", { ready: false });
    expect(calls).toHaveLength(1);
    expect(raw.listenerCount("message")).toBe(0);

    expect(child.once("exit", listener)).toBeUndefined();
    raw.emit("exit", 3, null);
    raw.emit("exit", 3, null);
    expect(calls.slice(1)).toEqual([{ receiver: undefined, args: [] }]);
    expect(child.once("error", listener)).toBeUndefined();
    expect(child.off("error", listener)).toBeUndefined();
    expect(raw.listenerCount("error")).toBe(0);

    expect(child.disconnect()).toBeUndefined();
    expect(child.unref()).toBeUndefined();
    expect(child.kill("SIGTERM")).toBeUndefined();
    expect(raw.kill).toHaveBeenCalledWith("SIGTERM");
    expect(child.pid).toBe(7);
  });

  it("give the command context exactly its documented members", async () => {
    const ctx = pluginCommandContext(executionContext());
    expect(reachable(ctx)).toEqual(CONTEXT_MEMBERS);
    expect(reachable(ctx.deadline)).toEqual(["signal", "remainingMs", "expired", "assertActive"]);
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(await ctx.readStdinBytes()).toEqual(new Uint8Array([1]));
  });

  it("refuse stdin when a secret was given on it", async () => {
    const ctx = pluginCommandContext(executionContext(["password"]));
    await expect(ctx.readStdinBytes()).rejects.toMatchObject({
      code: "invalid_option",
      message: "stdin is already used by --password-stdin",
    });
    await expect(ctx.readStdinBytes("--body-file -")).rejects.toMatchObject({
      code: "invalid_option",
      message: "--body-file - cannot share stdin with --password-stdin",
    });
  });

  it("give each host service exactly its documented members", () => {
    const gateway = { getTrc20Balance: vi.fn(), getTokenInfo: vi.fn(), sendRaw: vi.fn() };
    const child = {
      pid: 7,
      connected: true,
      on: vi.fn(),
      once: vi.fn(),
      off: vi.fn(),
      disconnect: vi.fn(),
      unref: vi.fn(),
      kill: vi.fn(),
      send: vi.fn(),
      stdin: null,
    };
    const launcher = { startDetached: vi.fn(() => child) };
    const aliases = { nile: "tron:3448148188" };
    const services = hostServices({
      signing: {
        assertCanSign: vi.fn(),
        prepare: vi.fn(),
        signerAddress: vi.fn(),
        sign: vi.fn(),
        resolve: vi.fn(),
      } as never,
      tronCalls: { run: vi.fn(), gateways: {} } as never,
      tokens: { official: vi.fn(), effective: vi.fn(), add: vi.fn() } as never,
      aliases,
      networks: { resolve: vi.fn(), resolveDefault: vi.fn() } as never,
      lifetime: { keepAlive: vi.fn(), longLived: false } as never,
      launcher,
      streams: { errorLine: vi.fn(), diagnostic: vi.fn(), result: vi.fn() } as never,
      output: "json",
      accounts: { resolveAccount: vi.fn(), unlock: vi.fn() } as never,
      gateways: {
        get: () => gateway,
        client: () => ({ getNativeBalance: vi.fn(), x: 1 }),
      } as never,
      contracts: {
        tron: { call: vi.fn(), send: vi.fn(), deploy: vi.fn() },
        evm: { call: vi.fn(), send: vi.fn(), deploy: vi.fn() },
      } as never,
      recipients: { resolve: vi.fn() },
      config: {
        credentials: new Map([
          ["demoApiKey", "k"],
          ["demoApiSecret", "s"],
          ["otherApiKey", "b"],
        ]),
      },
      broadcastGuard: { assertAllowed: vi.fn() },
    });
    expect(reachable(services)).toEqual([
      "signing",
      "gateways",
      "contracts",
      "tronCalls",
      "tokens",
      "networks",
      "recipients",
      "config",
      "broadcastGuard",
      "lifetime",
      "accounts",
    ]);
    expect(reachable(services.signing)).toEqual([
      "assertCanSign",
      "prepare",
      "signerAddress",
      "sign",
    ]);
    expect(reachable(services.gateways)).toEqual(["get", "client"]);
    expect(reachable(services.gateways.client({} as never, {} as never))).toEqual([
      "getNativeBalance",
    ]);
    expect(reachable(services.gateways.get({} as never, "tron", {} as never))).toEqual([
      "getTrc20Balance",
      "getTokenInfo",
      "getAccount",
      "getTransactionInfoById",
      "receivedAmount",
      "triggerConstantContract",
    ]);
    expect(reachable(services.gateways.get({} as never, "evm", {} as never))).toEqual([
      "getTransactionReceipt",
      "getErc20Balance",
    ]);
    expect(reachable(services.contracts)).toEqual(["tron", "evm"]);
    expect(reachable(services.contracts.tron)).toEqual(["call", "send"]);
    expect(reachable(services.contracts.evm)).toEqual(["call", "send"]);
    expect(reachable(services.tronCalls)).toEqual(["run"]);
    expect(reachable(services.tokens)).toEqual(["official", "effective"]);
    expect(reachable(services.networks)).toEqual(["aliases", "resolve"]);
    aliases.nile = "changed";
    expect(services.networks.aliases()).toEqual({ nile: "tron:3448148188" });
    expect(Object.isFrozen(services.networks.aliases())).toBe(true);
    expect(reachable(services.recipients)).toEqual(["resolve"]);
    expect(reachable(services.config)).toEqual(["networkBlock", "credential"]);
    expect(reachable(services.broadcastGuard)).toEqual(["assertAllowed"]);
    expect(reachable(services.lifetime)).toEqual(["keepAlive", "startDetached", "log"]);
    const started = services.lifetime.startDetached({
      argv: ["x402", "serve"],
      env: { MARKER: "1" },
      stderr: 9,
      execPath: "/bin/sh",
    } as never);
    expect(launcher.startDetached.mock.calls).toEqual([
      [{ argv: ["x402", "serve"], env: { MARKER: "1" }, stderr: 9 }],
    ]);
    expect(reachable(started)).toEqual([
      "pid",
      "connected",
      "on",
      "once",
      "off",
      "disconnect",
      "unref",
      "kill",
    ]);
    expect(started.pid).toBe(7);
    expect(reachable(services.lifetime.log)).toEqual(["record", "diagnostic"]);
    expect(reachable(services.accounts)).toEqual(["checkAccount"]);
    expect(services.accounts.checkAccount("main", "tron")).toBeUndefined();
    expect(services.config.credential("tronlinkSecretKey" as never)).toBeUndefined();
    expect(services.config.credential("demoApiKey")).toBe("k");
  });

  it("give the plugin host exactly its documented members", () => {
    let members: string[] = [];
    registerPlugin(
      plugin((host) => (members = reachable(host))),
      targets(),
    );
    expect(members).toEqual(["services", "command", "chainCommand", "errorCodes", "capabilities"]);
  });
});

describe("plugin credentials", () => {
  const credentialTargets = () => ({
    ...targets(),
    services: {
      config: { credential: (key: string) => `value of ${key}`, networkBlock: vi.fn() },
    } as unknown as HostServices,
  });

  it("hands a plugin only the credential keys it declares", () => {
    let config: HostServices["config"] | undefined;
    const result = registerPlugin(
      plugin((host) => (config = host.services.config), {
        credentials: [{ key: "demoApiKey", summary: "Demo API key" }],
      }),
      credentialTargets(),
    );
    expect(result).toEqual({ ok: true });
    expect(config!.credential("demoApiKey")).toBe("value of demoApiKey");
    for (const key of ["otherApiKey", "undeclaredApiKey", "constructor", "toString", "__proto__"]) {
      expect(() => config!.credential(key)).toThrow(/did not declare the credential/);
    }
  });

  it("does not count a key another plugin declares", () => {
    const t = credentialTargets();
    registerPlugin(
      plugin(() => {}, {
        name: "owner",
        groups: [{ name: "owner", summary: "Owner", families: [] }],
        credentials: [{ key: "ownerApiKey", summary: "Owner key" }],
      }),
      t,
    );
    let config: HostServices["config"] | undefined;
    registerPlugin(
      plugin((host) => (config = host.services.config)),
      t,
    );
    expect(() => config!.credential("ownerApiKey")).toThrow(/did not declare/);
  });

  it("lets two plugins declare the same key", () => {
    const t = credentialTargets();
    const shared = [{ key: "sharedApiKey", summary: "Shared key" }];
    const read: (string | undefined)[] = [];
    for (const name of ["first", "second"]) {
      const result = registerPlugin(
        plugin((host) => read.push(host.services.config.credential("sharedApiKey")), {
          name,
          groups: [{ name, summary: name, families: [] }],
          credentials: shared,
        }),
        t,
      );
      expect(result).toEqual({ ok: true });
    }
    expect(read).toEqual(["value of sharedApiKey", "value of sharedApiKey"]);
  });

  it.each([
    ["a core configuration key", [{ key: "timeoutMs", summary: "S" }]],
    ["a malformed key", [{ key: "demo-key", summary: "S" }]],
    [
      "a repeated key",
      [
        { key: "demoKey", summary: "A" },
        { key: "demoKey", summary: "B" },
      ],
    ],
  ])("refuses a definition that declares %s", (_label, credentials) => {
    const t = targets();
    const before = contents(t);
    const result = registerPlugin(
      plugin((host) => host.chainCommand(spec(["demo", "show"]), "tron", { run }), {
        credentials,
      }),
      t,
    );
    expect(result.ok).toBe(false);
    expect(contents(t)).toEqual(before);
  });
});

describe("an error code several plugins share", () => {
  const twin = (name: string, register: (host: PluginHost) => void) =>
    plugin(register, { name, groups: [{ name, summary: name, families: [] }] });

  it.each([
    ["first", "second"],
    ["second", "first"],
  ])("is published once when %s and then %s declare the same entry", (a, b) => {
    const t = targets();
    for (const name of [a, b]) {
      const result = registerPlugin(
        twin(name, (host) => host.errorCodes({ demo_shared: ENTRY })),
        t,
      );
      expect(result).toEqual({ ok: true });
    }
    expect(t.errorCodes.entry("demo_shared")).toEqual(ENTRY);
    expect(Object.keys(t.errorCodes.table()).filter((c) => c === "demo_shared")).toHaveLength(1);
  });

  it("refuses a second plugin that declares a different entry", () => {
    const t = targets();
    registerPlugin(
      twin("first", (host) => host.errorCodes({ demo_shared: ENTRY })),
      t,
    );
    const result = registerPlugin(
      twin("second", (host) => host.errorCodes({ demo_shared: { ...ENTRY, retry: "same" } })),
      t,
    );
    expect(result.ok).toBe(false);
    expect(t.errorCodes.entry("demo_shared")).toEqual(ENTRY);
  });

  it("keeps the first entry when a second plugin stages it and then fails", () => {
    const t = targets();
    registerPlugin(
      twin("first", (host) => host.errorCodes({ demo_shared: ENTRY })),
      t,
    );
    const result = registerPlugin(
      twin("second", (host) => {
        host.errorCodes({ demo_shared: ENTRY, demo_second_only: ENTRY });
        throw new Error("second failed");
      }),
      t,
    );
    expect(result).toEqual({ ok: false, reason: "second failed" });
    expect(t.errorCodes.entry("demo_shared")).toEqual(ENTRY);
    expect(t.errorCodes.entry("demo_second_only")).toBeUndefined();
    expect(t.commands.groups().map((g) => g.name)).toEqual(["first"]);
  });
});
