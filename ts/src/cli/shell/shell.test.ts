// ts/src/cli/shell/shell.test.ts
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { gapFillRequiredFields } from "./index.js";
import { accountRef } from "../../runtime/adapter/index.js";
import type { CommandDefinition } from "../../core/types/index.js";
import type { Prompter as PrompterType } from "../../infra/prompt/index.js";

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
  const selectCalls: Array<{ label: string; choices: Array<{ value: string; label: string }> }> = [];

  return {
    isTTY: () => tty,
    textCalls,
    selectCalls,
    async text(o: { label: string; validate?: (v: string) => string | null }) {
      textCalls.push({ label: o.label });
      return textAnswers.shift() ?? "";
    },
    async hidden(_o: { label: string }) { return ""; },
    async confirm(_o: { label: string }) { return false; },
    async select(o: { label: string; choices: Array<{ value: string; label: string }> }) {
      selectCalls.push({ label: o.label, choices: o.choices });
      return (selectAnswers.shift() ?? o.choices[0]?.value ?? "") as any;
    },
  } as any;
}

// ── minimal command builder for gapFillRequiredFields tests ──────────────────

function makeCmd(shape: z.ZodRawShape, opts: Partial<Pick<CommandDefinition, "auth" | "wallet" | "network">> = {}): CommandDefinition {
  const fields = z.object(shape);
  return {
    id: "test.cmd",
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
    expect(prompter.textCalls[0]!.label).toBe("address");
    expect(prompter.selectCalls).toHaveLength(0);
  });

  it("uses kebab label for a multi-word required string field under TTY", async () => {
    const cmd = makeCmd({ toAddress: z.string() });
    const argv: Record<string, unknown> = {};
    const prompter = makeFakePrompter({ tty: true, textAnswers: ["TAbcd1234"] });
    await gapFillRequiredFields(cmd, argv, prompter);
    expect(argv.toAddress).toBe("TAbcd1234");
    expect(prompter.textCalls).toHaveLength(1);
    expect(prompter.textCalls[0]!.label).toBe("to-address");
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
    expect(prompter.textCalls[0]!.label).toBe("label (optional, Enter to skip)");
  });

  it("sets an optional field when the user types a value", async () => {
    const cmd = makeCmd({ label: z.string().optional() });
    const argv: Record<string, unknown> = {};
    const prompter = makeFakePrompter({ tty: true, textAnswers: ["main"] });
    await gapFillRequiredFields(cmd, argv, prompter);
    expect(argv.label).toBe("main");
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
      { value: "wlt_a.0", label: "main (active) — tron:TA / evm:0xA" },
      { value: "wlt_b.0", label: "cold — tron:TB / evm:0xB" },
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
import { buildCli, type ShellOptions, type SessionRef } from "./index.js";
import { CommandRegistry } from "../../runtime/registry/index.js";
import { CapabilityGate } from "../../runtime/capability/index.js";
import { CapabilityRegistry } from "../../runtime/chain/index.js";
import { StreamManager } from "../../core/stream/index.js";
import { createOutputFormatter } from "../../runtime/output/index.js";
import { ConfigLoader, NetworkRegistry } from "../../infra/config/index.js";
import { AtomicFileStore } from "../../core/fs/index.js";
import { Keystore } from "../../infra/keystore/index.js";
import { SecretResolver } from "../../infra/secret/index.js";
import { Prompter } from "../../infra/prompt/index.js";

describe("dispatch password-prime wiring", () => {
  it("calls primePassword with mode='set' for auth=required command when keystore is uninitialized", async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), "wallet-cli-test-"));
    const store = new AtomicFileStore();
    // Fake prompter that is a TTY and responds with a valid password for primePassword
    const fakeBackend = {
      isTTY: () => true,
      async question(_prompt: string, _hidden: boolean) { return "Abcdef1!"; },
      async readKey() { return { name: "return" }; },
      write(_s: string) {},
      beginRaw() {},
      endRaw() {},
    };
    const prompter = new Prompter(fakeBackend);

    const streams = new StreamManager("text", true, false);
    const secrets = new SecretResolver(streams, {}, prompter);
    const keystore = new Keystore(tmpRoot, store, () => secrets.masterPassword());

    const spyPrime = vi.spyOn(secrets, "primePassword");

    const config = ConfigLoader.load();
    const networkRegistry = new NetworkRegistry(config, (_d) => { throw new Error("no rpc"); }, {});

    let ran = false;
    const registry = new CommandRegistry();
    registry.add({
      id: "wallet.test-auth",
      path: ["test-auth"],
      network: "none",
      wallet: "none",
      auth: "required",
      passwordMode: "establish" as const,
      fields: z.object({}),
      input: z.object({}),
      examples: [],
      async run(_ctx: any, _net: any, _input: any) { ran = true; return {}; },
    } as unknown as CommandDefinition);

    const startedAt = Date.now();
    const formatter = createOutputFormatter("text", streams, startedAt);

    const session: SessionRef = {};
    const globals = {
      output: "text" as const,
      quiet: true,
      verbose: false,
    };
    const deps = { config, networkRegistry, streams, secrets, keystore, prompter, formatter };
    const capabilityRegistry = new CapabilityRegistry();
    const capGate = new CapabilityGate(capabilityRegistry);

    const shellOpts: ShellOptions = {
      registry,
      globals,
      deps,
      capGate,
      streams,
      formatter,
      session,
    };

    await buildCli(shellOpts).parseAsync(["wallet", "test-auth"]);

    expect(spyPrime).toHaveBeenCalledOnce();
    expect(spyPrime.mock.calls[0]![0].mode).toBe("set");
    expect(ran).toBe(true);
  });

  it("does NOT call primePassword and throws auth_required for auth=required command WITHOUT passwordMode", async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), "wallet-cli-test-"));
    const store = new AtomicFileStore();
    const fakeBackend = {
      isTTY: () => false,
      async question(_prompt: string, _hidden: boolean) { return ""; },
      async readKey() { return { name: "return" }; },
      write(_s: string) {},
      beginRaw() {},
      endRaw() {},
    };
    const prompter = new Prompter(fakeBackend);

    const streams = new StreamManager("text", true, false);
    const secrets = new SecretResolver(streams, {}, prompter);
    const keystore = new Keystore(tmpRoot, store, () => secrets.masterPassword());

    const spyPrime = vi.spyOn(secrets, "primePassword");

    const config = ConfigLoader.load();
    const networkRegistry = new NetworkRegistry(config, (_d) => { throw new Error("no rpc"); }, {});

    const registry = new CommandRegistry();
    registry.add({
      id: "wallet.test-auth-nopw",
      path: ["test-auth-nopw"],
      network: "none",
      wallet: "none",
      auth: "required",
      // no passwordMode — lazy guard path
      fields: z.object({}),
      input: z.object({}),
      examples: [],
      async run(_ctx: any, _net: any, _input: any) { return {}; },
    } as unknown as CommandDefinition);

    const startedAt = Date.now();
    const formatter = createOutputFormatter("text", streams, startedAt);

    const session: SessionRef = {};
    const globals = {
      output: "text" as const,
      quiet: true,
      verbose: false,
    };
    const deps = { config, networkRegistry, streams, secrets, keystore, prompter, formatter };
    const capabilityRegistry = new CapabilityRegistry();
    const capGate = new CapabilityGate(capabilityRegistry);

    const shellOpts: ShellOptions = {
      registry,
      globals,
      deps,
      capGate,
      streams,
      formatter,
      session,
    };

    await expect(
      buildCli(shellOpts).parseAsync(["wallet", "test-auth-nopw"])
    ).rejects.toMatchObject({ code: "auth_required" });

    expect(spyPrime).not.toHaveBeenCalled();
  });
});
