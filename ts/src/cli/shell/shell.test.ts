// ts/src/cli/shell/shell.test.ts
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { gapFillRequiredFields } from "./index.js";
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
    async text(o) {
      textCalls.push({ label: o.label });
      return textAnswers.shift() ?? "";
    },
    async hidden(_o) { return ""; },
    async confirm(_o) { return false; },
    async select(o) {
      selectCalls.push({ label: o.label, choices: o.choices as any });
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

  it("does NOT prompt for a field already present in argv", async () => {
    const cmd = makeCmd({ address: z.string() });
    const argv: Record<string, unknown> = { address: "already" };
    const prompter = makeFakePrompter({ tty: true });
    await gapFillRequiredFields(cmd, argv, prompter);
    expect(argv.address).toBe("already");
    expect(prompter.textCalls).toHaveLength(0);
    expect(prompter.selectCalls).toHaveLength(0);
  });

  it("does NOT prompt for an optional field (z.string().optional()) missing under TTY", async () => {
    const cmd = makeCmd({ label: z.string().optional() });
    const argv: Record<string, unknown> = {};
    const prompter = makeFakePrompter({ tty: true });
    await gapFillRequiredFields(cmd, argv, prompter);
    expect(argv.label).toBeUndefined();
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
      fields: z.object({}),
      input: z.object({}),
      examples: [],
      async run(_ctx, _net, _input) { ran = true; return {}; },
    } as unknown as CommandDefinition);

    const startedAt = Date.now();
    const formatter = createOutputFormatter("text", streams, startedAt);

    const session: SessionRef = {};
    const globals = {
      output: "text" as const,
      quiet: true,
      verbose: false,
      noDeviceWait: false,
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
});
