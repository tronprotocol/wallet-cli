import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { CommandRegistry } from "../../adapters/inbound/cli/registry/index.js";
import { CapabilityRegistry } from "../../application/services/capability/index.js";
import { errorCodeEntry, ErrorCodeTable } from "../../domain/errors/codes.js";
import { FollowUpTable } from "../../adapters/inbound/cli/output/errors.js";
import type { ExecutionContext } from "../../adapters/inbound/cli/contracts/index.js";
import type { NetworkDescriptor } from "../../domain/types/index.js";
import {
  PLUGIN_API_REVISION,
  PLUGIN_API_VERSION,
  type HostServices,
  type PluginDefinition,
  type PluginHost,
} from "../../plugin-api/index.js";
import type { PluginChainSpec } from "../../plugin-api/cli.js";
import { hostServices, pluginCommandContext, registerPlugin, type PluginTargets } from "./host.js";
import { BUILTIN_PLUGINS } from "./builtin.js";

const SERVICES = {} as HostServices;

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
    followUps: new FollowUpTable(),
    networks: NETWORKS,
    services: SERVICES,
    timeoutMs: 0,
  };
}

// Everything a registration can change, for comparing before and after.
function contents(t: PluginTargets & { capabilities: CapabilityRegistry }) {
  return {
    commands: t.commands.all().map((c) => ("spec" in c ? c.spec.path : c.path).join(" ")),
    groups: t.commands.groups().map((g) => g.name),
    codes: Object.keys(t.errorCodes.table()).length,
    predicate: t.capabilities.hasPredicate("demo.read"),
    followUp: t.followUps.spelling("demo-show"),
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
        host.followUps({ "demo-show": () => "demo show" });
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
    expect(t.followUps.spelling("demo-show")?.(undefined)).toBe("demo show");
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
        host.followUps({ "demo-partial": () => "demo show" });
        throw new Error("register failed");
      }),
      t,
    );
    expect(result).toEqual({ ok: false, reason: "register failed" });
    expect(t.commands.resolveChain(["demo", "show"])).toBeNull();
    expect(t.commands.groups()).toEqual([]);
    expect(t.errorCodes.entry("demo_partial_failed")).toBeUndefined();
    expect(t.capabilities.hasPredicate("demo.partial")).toBe(false);
    expect(t.followUps.spelling("demo-partial")).toBeUndefined();
  });

  it("fails a plugin that catches a refused declaration, and stages no part of a refused batch", () => {
    const t = targets();
    const before = contents(t);
    const result = registerPlugin(
      plugin((host) => {
        host.chainCommand(spec(["demo", "show"]), "tron", { run });
        host.followUps({ "demo-show": () => "demo show" });
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
        host.followUps({ "demo-show": () => "demo show" });
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

  it("keeps each runtime's codes and follow-ups to itself", () => {
    const declare = () =>
      plugin((host) => {
        host.errorCodes({ demo_runtime: ENTRY });
        host.followUps({ "demo-show": () => "demo show" });
      });
    const a = targets();
    const b = targets();
    expect(registerPlugin(declare(), a)).toEqual({ ok: true });
    expect(b.errorCodes.entry("demo_runtime")).toBeUndefined();
    expect(b.followUps.spelling("demo-show")).toBeUndefined();
    expect(registerPlugin(declare(), b)).toEqual({ ok: true });
    expect(b.followUps.spelling("demo-show")?.(undefined)).toBe("demo show");
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

  it("registers the built-in plugins", () => {
    const t = targets();
    for (const builtin of BUILTIN_PLUGINS) expect(registerPlugin(builtin, t)).toEqual({ ok: true });
  });
});

const CONTEXT_MEMBERS = [
  "deadline",
  "activeAccount",
  "resolveAddress",
  "wait",
  "emit",
  "warn",
  "output",
  "timeoutMs",
  "readStdinBytes",
  "log",
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

describe("objects handed to a plugin", () => {
  it("give the command context exactly its documented members", async () => {
    const ctx = pluginCommandContext(executionContext(), 5000);
    expect(reachable(ctx)).toEqual(CONTEXT_MEMBERS);
    expect(reachable(ctx.deadline)).toEqual(["signal", "remainingMs", "expired", "assertActive"]);
    expect(reachable(ctx.log)).toEqual(["line", "diagnostic"]);
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(ctx.timeoutMs).toBe(5000);
    expect(await ctx.readStdinBytes()).toEqual(new Uint8Array([1]));
  });

  it("refuse stdin when a secret was given on it", async () => {
    const ctx = pluginCommandContext(executionContext(["password"]), 0);
    await expect(ctx.readStdinBytes()).rejects.toMatchObject({ code: "invalid_option" });
  });

  it("give each host service exactly its documented members", () => {
    const gateway = { getTrc20Balance: vi.fn(), getTokenInfo: vi.fn(), sendRaw: vi.fn() };
    const aliases = { nile: "tron:3448148188" };
    const services = hostServices({
      signing: { assertCanSign: vi.fn(), signerAddress: vi.fn(), sign: vi.fn() } as never,
      tronCalls: { run: vi.fn(), gateways: {} } as never,
      tokens: { official: vi.fn(), effective: vi.fn(), add: vi.fn() } as never,
      aliases,
      gateways: { get: () => gateway, client: vi.fn() } as never,
      contracts: {
        tron: { call: vi.fn(), send: vi.fn(), deploy: vi.fn() },
        evm: { call: vi.fn(), send: vi.fn(), deploy: vi.fn() },
      } as never,
      recipients: { resolve: vi.fn() },
      config: { gasfreeApiKey: "k", gasfreeApiSecret: "s", baiApiKey: "b" },
      broadcastGuard: { assertAllowed: vi.fn() },
      clock: () => 7,
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
      "clock",
    ]);
    expect(reachable(services.signing)).toEqual(["assertCanSign", "signerAddress", "sign"]);
    expect(reachable(services.gateways)).toEqual(["get"]);
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
    ]);
    expect(reachable(services.contracts)).toEqual(["tron", "evm"]);
    expect(reachable(services.contracts.tron)).toEqual(["call", "send"]);
    expect(reachable(services.contracts.evm)).toEqual(["call", "send"]);
    expect(reachable(services.tronCalls)).toEqual(["run"]);
    expect(reachable(services.tokens)).toEqual(["official", "effective"]);
    expect(reachable(services.networks)).toEqual(["aliases"]);
    aliases.nile = "changed";
    expect(services.networks.aliases()).toEqual({ nile: "tron:3448148188" });
    expect(Object.isFrozen(services.networks.aliases())).toBe(true);
    expect(reachable(services.recipients)).toEqual(["resolve"]);
    expect(reachable(services.config)).toEqual(["networkBlock", "credential"]);
    expect(reachable(services.broadcastGuard)).toEqual(["assertAllowed"]);
    expect(reachable(services.clock)).toEqual(["now"]);
    expect(services.clock.now()).toBe(7);
    expect(services.config.credential("tronlinkSecretKey" as never)).toBeUndefined();
    expect(services.config.credential("gasfreeApiKey")).toBe("k");
  });

  it("give the plugin host exactly its documented members", () => {
    let members: string[] = [];
    registerPlugin(
      plugin((host) => (members = reachable(host))),
      targets(),
    );
    expect(members).toEqual([
      "apiVersion",
      "services",
      "command",
      "chainCommand",
      "errorCodes",
      "capabilities",
      "followUps",
    ]);
  });
});
