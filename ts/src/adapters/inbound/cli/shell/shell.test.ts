import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { bindGroupedPositionals, gapFillRequiredFields, isInteractiveCommand } from "./index.js";
import { accountRef } from "../arity/index.js";
import type { CommandDefinition } from "../contracts/index.js";
import type { Prompter as PrompterType } from "../input/prompt/index.js";

describe("grouped leaf positionals", () => {
  const command = {
    path: ["contact", "add"],
    positionals: [{ field: "name" }, { field: "address" }],
  };

  it("binds args to the resolved leaf's declared fields", () => {
    expect(
      bindGroupedPositionals(command, {
        verb: "add",
        args: ["alice", "Taddress"],
      }),
    ).toMatchObject({
      verb: "add",
      name: "alice",
      address: "Taddress",
    });
  });

  it("rejects too many or ambiguously duplicated arguments", () => {
    expect(() =>
      bindGroupedPositionals(command, {
        args: ["alice", "Taddress", "extra"],
      }),
    ).toThrow(/too many positional/);
    expect(() =>
      bindGroupedPositionals(command, {
        args: ["alice"],
        name: "bob",
      }),
    ).toThrow(/both positionally/);
  });
});

// ── fake prompter ─────────────────────────────────────────────────────────────

interface FakePrompterOpts {
  tty?: boolean;
  textAnswers?: string[];
  selectAnswers?: string[];
}

function makeFakePrompter(opts: FakePrompterOpts = {}): PrompterType & {
  textCalls: Array<{ label: string }>;
  selectCalls: Array<{ label: string; choices: Array<{ value: string; label: string }> }>;
} {
  const { tty = true, textAnswers = [], selectAnswers = [] } = opts;
  const textCalls: Array<{ label: string }> = [];
  const selectCalls: Array<{ label: string; choices: Array<{ value: string; label: string }> }> =
    [];

  return {
    isTTY: () => tty,
    textCalls,
    selectCalls,
    async text(o: { label: string; validate?: (v: string) => string | null }) {
      textCalls.push({ label: o.label });
      return textAnswers.shift() ?? "";
    },
    async hidden(_o: { label: string }) {
      return "";
    },
    async confirm(_o: { label: string }) {
      return false;
    },
    async select(o: { label: string; choices: Array<{ value: string; label: string }> }) {
      selectCalls.push({ label: o.label, choices: o.choices });
      return (selectAnswers.shift() ?? o.choices[0]?.value ?? "") as any;
    },
  } as any;
}

// ── minimal command builder for gapFillRequiredFields tests ──────────────────

function makeCmd(
  shape: z.ZodRawShape,
  opts: Partial<Pick<CommandDefinition, "auth" | "wallet" | "network">> = {},
): CommandDefinition {
  const fields = z.object(shape);
  return {
    path: ["cmd"],
    network: "none",
    wallet: "none",
    auth: "none",
    fields,
    input: fields,
    examples: [],
    run: async () => ({}),
    ...opts,
  } as unknown as CommandDefinition;
}

// ── isInteractiveCommand ─────────────────────────────────────────────────────

describe("isInteractiveCommand", () => {
  it("allows interaction when the command opts in via interactive:true", () => {
    expect(isInteractiveCommand({ interactive: true } as unknown as CommandDefinition)).toBe(true);
  });

  it("disables interaction by default (script-safe)", () => {
    expect(isInteractiveCommand({} as unknown as CommandDefinition)).toBe(false);
    expect(isInteractiveCommand({ interactive: false } as unknown as CommandDefinition)).toBe(
      false,
    );
  });
});

// ── gapFillRequiredFields unit tests ─────────────────────────────────────────

describe("gapFillRequiredFields", () => {
  it("uses select for a required enum field missing under TTY", async () => {
    const cmd = makeCmd({ app: z.enum(["tron", "ethereum"]) });
    const argv: Record<string, unknown> = {};
    const prompter = makeFakePrompter({ tty: true, selectAnswers: ["tron"] });
    await gapFillRequiredFields(cmd, argv, prompter);
    expect(argv.app).toBe("tron");
    expect(prompter.selectCalls).toHaveLength(1);
    expect(prompter.selectCalls[0]!.choices.map((c) => c.value)).toEqual(["tron", "ethereum"]);
    expect(prompter.textCalls).toHaveLength(0);
  });

  it("uses text for a required string field missing under TTY", async () => {
    const cmd = makeCmd({ address: z.string() });
    const argv: Record<string, unknown> = {};
    const prompter = makeFakePrompter({ tty: true, textAnswers: ["TXyz"] });
    await gapFillRequiredFields(cmd, argv, prompter);
    expect(argv.address).toBe("TXyz");
    expect(prompter.textCalls).toHaveLength(1);
    expect(prompter.textCalls[0]!.label).toBe("Address");
    expect(prompter.selectCalls).toHaveLength(0);
  });

  it("uses kebab label for a multi-word required string field under TTY", async () => {
    const cmd = makeCmd({ toAddress: z.string() });
    const argv: Record<string, unknown> = {};
    const prompter = makeFakePrompter({ tty: true, textAnswers: ["TAbcd1234"] });
    await gapFillRequiredFields(cmd, argv, prompter);
    expect(argv.toAddress).toBe("TAbcd1234");
    expect(prompter.textCalls).toHaveLength(1);
    expect(prompter.textCalls[0]!.label).toBe("To Address");
    expect(prompter.selectCalls).toHaveLength(0);
  });

  it("does NOT prompt for a field already present in argv", async () => {
    const cmd = makeCmd({ address: z.string() });
    const argv: Record<string, unknown> = { address: "already" };
    const prompter = makeFakePrompter({ tty: true });
    await gapFillRequiredFields(cmd, argv, prompter);
    expect(argv.address).toBe("already");
    expect(prompter.textCalls).toHaveLength(0);
    expect(prompter.selectCalls).toHaveLength(0);
  });

  it("offers an optional field but Enter (empty) skips it → left unset", async () => {
    const cmd = makeCmd({ label: z.string().optional() });
    const argv: Record<string, unknown> = {};
    const prompter = makeFakePrompter({ tty: true }); // no answer queued → "" (Enter)
    await gapFillRequiredFields(cmd, argv, prompter);
    expect(argv.label).toBeUndefined(); // skipped → command default applies
    expect(prompter.textCalls).toHaveLength(1);
    expect(prompter.textCalls[0]!.label).toBe("Label (optional, press Enter to skip)");
  });

  it("sets an optional field when the user types a value", async () => {
    const cmd = makeCmd({ label: z.string().optional() });
    const argv: Record<string, unknown> = {};
    const prompter = makeFakePrompter({ tty: true, textAnswers: ["main"] });
    await gapFillRequiredFields(cmd, argv, prompter);
    expect(argv.label).toBe("main");
  });

  it("offers a random default label for interactive wallet creation/import commands", async () => {
    const cmd = makeCmd({ label: z.string().optional() });
    cmd.promptHints = { label: "default-label" };
    const argv: Record<string, unknown> = {};
    const prompter = makeFakePrompter({ tty: true }); // Enter accepts the generated default
    await gapFillRequiredFields(cmd, argv, prompter);
    expect(argv.label).toMatch(/^wallet_[0-9a-f]{6}$/);
    expect(prompter.textCalls).toHaveLength(1);
    expect(prompter.textCalls[0]!.label).toMatch(/^Label \(default: wallet_[0-9a-f]{6}\)$/);
  });

  it("does not prompt optional Ledger locators; missing locator enters command-level selection", async () => {
    const cmd = makeCmd({
      app: z.enum(["tron", "ethereum"]),
      index: z.number().optional(),
      path: z.string().optional(),
      address: z.string().optional(),
      scanLimit: z.number().optional(),
      label: z.string().optional(),
    });
    cmd.promptHints = {
      label: "default-label",
      index: "skip",
      path: "skip",
      address: "skip",
      scanLimit: "skip",
    };
    const argv: Record<string, unknown> = {};
    const prompter = makeFakePrompter({
      tty: true,
      selectAnswers: ["tron"],
      textAnswers: ["cold"],
    });
    await gapFillRequiredFields(cmd, argv, prompter);
    expect(argv).toEqual({ app: "tron", label: "cold" });
    expect(prompter.selectCalls).toHaveLength(1);
    expect(prompter.textCalls.map((c) => c.label)[0]).toMatch(
      /^Label \(default: wallet_[0-9a-f]{6}\)$/,
    );
  });

  it("does NOT prompt for an optional boolean flag", async () => {
    const cmd = makeCmd({ yes: z.boolean().optional() });
    const argv: Record<string, unknown> = {};
    const prompter = makeFakePrompter({ tty: true });
    await gapFillRequiredFields(cmd, argv, prompter);
    expect(argv.yes).toBeUndefined();
    expect(prompter.textCalls).toHaveLength(0);
  });

  it("does NOT prompt for a field with a default missing under TTY", async () => {
    const cmd = makeCmd({ count: z.number().default(3) });
    const argv: Record<string, unknown> = {};
    const prompter = makeFakePrompter({ tty: true });
    await gapFillRequiredFields(cmd, argv, prompter);
    expect(argv.count).toBeUndefined();
    expect(prompter.textCalls).toHaveLength(0);
  });

  it("arrow-selects an existing account for a branded account-ref field", async () => {
    const cmd = makeCmd({ account: accountRef("account or wallet") });
    const argv: Record<string, unknown> = {};
    const prompter = makeFakePrompter({ tty: true, selectAnswers: ["wlt_b.0"] });
    const choices = () => [
      { value: "wlt_a.0", label: "main [active]" },
      { value: "wlt_b.0", label: "cold" },
    ];
    await gapFillRequiredFields(cmd, argv, prompter, choices);
    expect(argv.account).toBe("wlt_b.0");
    expect(prompter.selectCalls).toHaveLength(1);
    expect(prompter.selectCalls[0]!.choices.map((c) => c.value)).toEqual(["wlt_a.0", "wlt_b.0"]);
    expect(prompter.textCalls).toHaveLength(0);
  });

  it("falls back to free text for an account-ref field when no accounts exist", async () => {
    const cmd = makeCmd({ account: accountRef("account or wallet") });
    const argv: Record<string, unknown> = {};
    const prompter = makeFakePrompter({ tty: true, textAnswers: ["main"] });
    await gapFillRequiredFields(cmd, argv, prompter, () => []);
    expect(argv.account).toBe("main");
    expect(prompter.selectCalls).toHaveLength(0);
    expect(prompter.textCalls).toHaveLength(1);
  });

  it("does NOT prompt anything when isTTY() is false", async () => {
    const cmd = makeCmd({ app: z.enum(["tron", "ethereum"]), address: z.string() });
    const argv: Record<string, unknown> = {};
    const prompter = makeFakePrompter({ tty: false });
    await gapFillRequiredFields(cmd, argv, prompter);
    expect(argv.app).toBeUndefined();
    expect(argv.address).toBeUndefined();
    expect(prompter.textCalls).toHaveLength(0);
    expect(prompter.selectCalls).toHaveLength(0);
  });
});

// ── password-prime wiring test ────────────────────────────────────────────────

import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildCli, ShellOptions } from "./index.js";
import type { SessionRef } from "../contracts/index.js";
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

// ── positional parsing end-to-end ─────────────────────────────────────────────

describe("grouped positional parsing through yargs", () => {
  function positionalFixture(_tokens: string[]): { shellOpts: ShellOptions; seen: () => unknown } {
    const tmpRoot = mkdtempSync(join(tmpdir(), "wallet-cli-test-"));
    const store = new AtomicFileStore();
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
    const streams = new StreamManager("text", false);
    const secrets = new SecretResolver(streams, {}, prompter);
    const keystore = new Keystore(tmpRoot, store, () => secrets.masterPassword());
    const config = ConfigLoader.load();
    const networkRegistry = new NetworkRegistry(config);

    let received: unknown;
    const fields = z.object({ input: z.string().min(1), label: z.string().optional() });
    const registry = new CommandRegistry();
    // two leaves under one head → the `<head> [verb] [args..]` group form
    registry.add({
      path: ["encoding", "convert"],
      network: "none",
      wallet: "none",
      auth: "none",
      positionals: [{ field: "input" }],
      fields,
      input: fields,
      examples: [],
      run: async (_ctx: any, _net: any, input: any) => {
        received = input.input;
        return {};
      },
    } as unknown as CommandDefinition);
    registry.add({
      path: ["encoding", "other"],
      network: "none",
      wallet: "none",
      auth: "none",
      fields: z.object({}),
      input: z.object({}),
      examples: [],
      run: async () => ({}),
    } as unknown as CommandDefinition);
    // mirrors `use [account]`: positional field named after the global --account flag
    const acctFields = z.object({ account: z.string().min(1) });
    registry.add({
      path: ["acct"],
      network: "none",
      wallet: "none",
      auth: "none",
      positionals: [{ field: "account" }],
      fields: acctFields,
      input: acctFields,
      examples: [],
      run: async (_ctx: any, _net: any, input: any) => {
        received = input.account;
        return {};
      },
    } as unknown as CommandDefinition);
    const pairFields = z.object({ first: z.string(), second: z.string() });
    registry.add({
      path: ["pair"],
      network: "none",
      wallet: "none",
      auth: "none",
      positionals: [{ field: "first" }, { field: "second" }],
      fields: pairFields,
      input: pairFields,
      examples: [],
      run: async () => ({}),
    } as unknown as CommandDefinition);
    // single-segment leaf: yargs binds the positional by field name, no `args..` capture
    registry.add({
      path: ["cfg"],
      network: "none",
      wallet: "none",
      auth: "none",
      positionals: [{ field: "input" }],
      fields,
      input: fields,
      examples: [],
      run: async (_ctx: any, _net: any, input: any) => {
        received = input.input;
        return {};
      },
    } as unknown as CommandDefinition);

    const formatter = createOutputFormatter("text", streams, Date.now());
    return {
      seen: () => received,
      shellOpts: {
        registry,
        globals: { output: "text" as const, verbose: false },
        deps: { config, networkRegistry, streams, secrets, keystore, prompter, formatter },
        targetResolver: new TargetResolver({ networkRegistry, keystore }),
        caps: new CapabilityRegistry(),
        streams,
        formatter,
        session: {} as SessionRef,
      },
    };
  }

  it.each([
    ["0x12E94f5a3c88b17d2F6E0b9a45Cd310f8E7a6D29", "0x12E94f5a3c88b17d2F6E0b9a45Cd310f8E7a6D29"],
    ["0xdeadbeef", "0xdeadbeef"],
    ["12345", "12345"],
    ["1e5", "1e5"],
    ["TBhCfAytTEh52WFL6HYr64i2nmc3u3TCUp", "TBhCfAytTEh52WFL6HYr64i2nmc3u3TCUp"],
  ])("passes %s through verbatim as a string", async (argument, expected) => {
    const tokens = ["encoding", "convert", argument];
    const { shellOpts, seen } = positionalFixture(tokens);
    await buildCli(shellOpts).parseAsync(tokens);
    expect(seen()).toBe(expected);
  });

  // A field exposed as a positional is documented under Args, not Flags — the `--<field>` spelling
  // is not part of the contract. argv alone cannot tell the two apart (yargs writes both to the
  // same key), so the rejection is driven by the raw tokens.
  it.each([
    ["grouped leaf", ["encoding", "convert", "--input", "0xdeadbeef"]],
    ["grouped leaf, = form", ["encoding", "convert", "--input=0xdeadbeef"]],
    ["single-segment leaf", ["cfg", "--input", "0xdeadbeef"]],
    ["positional and flag together", ["encoding", "convert", "0xcafe", "--input", "0xdeadbeef"]],
  ])("rejects the --<field> spelling of a positional (%s)", async (_name, tokens) => {
    const { shellOpts } = positionalFixture(tokens);
    await expect(buildCli(shellOpts).parseAsync(tokens)).rejects.toMatchObject({
      code: "invalid_option",
      message: /unknown option\(s\): --input/,
    });
  });

  it("still accepts the positional form on a single-segment leaf", async () => {
    const tokens = ["cfg", "0xdeadbeef"];
    const { shellOpts, seen } = positionalFixture(tokens);
    await buildCli(shellOpts).parseAsync(tokens);
    expect(seen()).toBe("0xdeadbeef");
  });

  it("still accepts a non-positional flag on a command that has positionals", async () => {
    const tokens = ["encoding", "convert", "0xdeadbeef", "--verbose"];
    const { shellOpts, seen } = positionalFixture(tokens);
    await buildCli(shellOpts).parseAsync(tokens);
    expect(seen()).toBe("0xdeadbeef");
  });

  it("names every flagged positional in one message", async () => {
    const tokens = ["pair", "--first", "a", "--second", "b"];
    const { shellOpts } = positionalFixture(tokens);
    await expect(buildCli(shellOpts).parseAsync(tokens)).rejects.toMatchObject({
      message: /unknown option\(s\): --first, --second/,
    });
  });

  it("leaves a command that declares no positionals alone", async () => {
    const tokens = ["encoding", "other", "--nope"];
    const { shellOpts } = positionalFixture(tokens);
    // still rejected, but by assertKnownFlags — not by the positional guard
    await expect(buildCli(shellOpts).parseAsync(tokens)).rejects.toMatchObject({
      message: /unknown option\(s\): --nope/,
    });
  });

  // The token scan must not mistake a flag-shaped *value* for a flag the user typed. Both ways of
  // passing a literal `--input` as data survive: `=` keeps it on the right-hand side, and `--`
  // ends flag parsing entirely.
  it("does not treat a flag-shaped value as a typed flag", async () => {
    const tokens = ["encoding", "convert", "--label=--input", "0xdeadbeef"];
    const { shellOpts, seen } = positionalFixture(tokens);
    await buildCli(shellOpts).parseAsync(tokens);
    expect(seen()).toBe("0xdeadbeef");
  });

  // `use [account]` / `rename` / `delete` / `backup` name their positional after the global
  // --account flag. Rejecting it there would break a documented global on four real commands.
  it("does not reject a positional whose name is also a global flag", async () => {
    const tokens = ["acct", "--account", "main"];
    const { shellOpts, seen } = positionalFixture(tokens);
    await buildCli(shellOpts).parseAsync(tokens);
    expect(seen()).toBe("main");
  });

  it("ignores tokens after the -- terminator", async () => {
    const tokens = ["encoding", "convert", "0xdeadbeef", "--", "--input"];
    const { shellOpts, seen } = positionalFixture(tokens);
    await buildCli(shellOpts).parseAsync(tokens);
    expect(seen()).toBe("0xdeadbeef");
  });
});

describe("dispatch password-prime wiring", () => {
  it("calls primePassword with mode='set' for auth=required command when keystore is uninitialized", async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), "wallet-cli-test-"));
    const store = new AtomicFileStore();
    // Fake prompter that is a TTY and responds with a valid password for primePassword
    const fakeBackend = {
      isTTY: () => true,
      async question(_prompt: string, _hidden: boolean) {
        return "Abcdef1!";
      },
      async readKey() {
        return { name: "return" };
      },
      write(_s: string) {},
      beginRaw() {},
      endRaw() {},
    };
    const prompter = new Prompter(fakeBackend);

    const streams = new StreamManager("text", false);
    const secrets = new SecretResolver(streams, {}, prompter);
    const keystore = new Keystore(tmpRoot, store, () => secrets.masterPassword());

    const spyPrime = vi.spyOn(secrets, "primePassword");

    const config = ConfigLoader.load();
    const networkRegistry = new NetworkRegistry(config);

    let ran = false;
    const registry = new CommandRegistry();
    registry.add({
      path: ["create"], // an interactive command (passwordMode commands all are)
      network: "none",
      wallet: "none",
      auth: "required",
      interactive: true,
      passwordMode: "establish" as const,
      fields: z.object({}),
      input: z.object({}),
      examples: [],
      async run(_ctx: any, _net: any, _input: any) {
        ran = true;
        return {};
      },
    } as unknown as CommandDefinition);

    const startedAt = Date.now();
    const formatter = createOutputFormatter("text", streams, startedAt);

    const session: SessionRef = {};
    const globals = {
      output: "text" as const,
      verbose: false,
    };
    const deps = { config, networkRegistry, streams, secrets, keystore, prompter, formatter };
    const capabilityRegistry = new CapabilityRegistry();

    const shellOpts: ShellOptions = {
      registry,
      globals,
      deps,
      targetResolver: new TargetResolver({ networkRegistry, keystore }),
      caps: capabilityRegistry,
      streams,
      formatter,
      session,
    };

    await buildCli(shellOpts).parseAsync(["create"]);

    expect(spyPrime).toHaveBeenCalledOnce();
    expect(spyPrime.mock.calls[0]![0].mode).toBe("set");
    expect(ran).toBe(true);
  });

  // Lazy auth: a command WITHOUT passwordMode is never eager-unlocked. The password is demanded
  // only when its run() actually touches the key — so key-free paths (e.g. `tx send --dry-run`)
  // succeed with no unlock, while a path that signs/decrypts surfaces auth_required from the keystore.
  function lazyAuthFixture(run: (secrets: SecretResolver) => Promise<unknown>) {
    const tmpRoot = mkdtempSync(join(tmpdir(), "wallet-cli-test-"));
    const store = new AtomicFileStore();
    const fakeBackend = {
      isTTY: () => false,
      async question(_prompt: string, _hidden: boolean) {
        return "";
      },
      async readKey() {
        return { name: "return" };
      },
      write(_s: string) {},
      beginRaw() {},
      endRaw() {},
    };
    const prompter = new Prompter(fakeBackend);
    const streams = new StreamManager("text", false);
    const secrets = new SecretResolver(streams, {}, prompter);
    const keystore = new Keystore(tmpRoot, store, () => secrets.masterPassword());
    const spyPrime = vi.spyOn(secrets, "primePassword");
    const config = ConfigLoader.load();
    const networkRegistry = new NetworkRegistry(config);

    const registry = new CommandRegistry();
    registry.add({
      path: ["test-auth-nopw"],
      network: "none",
      wallet: "none",
      auth: "required",
      // no passwordMode — lazy guard path
      fields: z.object({}),
      input: z.object({}),
      examples: [],
      run: async (_ctx: any, _net: any, _input: any) => run(secrets),
    } as unknown as CommandDefinition);

    const startedAt = Date.now();
    const formatter = createOutputFormatter("text", streams, startedAt);
    const session: SessionRef = {};
    const globals = { output: "text" as const, verbose: false };
    const deps = { config, networkRegistry, streams, secrets, keystore, prompter, formatter };
    const shellOpts: ShellOptions = {
      registry,
      globals,
      deps,
      targetResolver: new TargetResolver({ networkRegistry, keystore }),
      caps: new CapabilityRegistry(),
      streams,
      formatter,
      session,
    };
    return { shellOpts, spyPrime };
  }

  it("does NOT eager-unlock and runs a key-free auth=required command without a password", async () => {
    let ran = false;
    const { shellOpts, spyPrime } = lazyAuthFixture(async () => {
      ran = true;
      return {};
    });
    await buildCli(shellOpts).parseAsync(["test-auth-nopw"]);
    expect(ran).toBe(true);
    expect(spyPrime).not.toHaveBeenCalled();
  });

  it("demands the password lazily when an auth=required command actually uses the key", async () => {
    const { shellOpts, spyPrime } = lazyAuthFixture(async (secrets) => {
      secrets.masterPassword();
      return {};
    });
    await expect(buildCli(shellOpts).parseAsync(["test-auth-nopw"])).rejects.toMatchObject({
      code: "auth_required",
    });
    expect(spyPrime).not.toHaveBeenCalled();
  });
});
