import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildCli, type ShellOptions } from "./index.js";
import {
  acceptsWaitFlags,
  isChainCommand,
  type SessionRef,
  type StoredCommand,
} from "../contracts/index.js";
import { composeCliRuntime } from "../../../../bootstrap/composition.js";
import { Prompter } from "../input/prompt/index.js";
import { SecretResolver } from "../input/secret/index.js";

describe("every registered positional command rejects its --<field> spelling", () => {
  let previousHome: string | undefined;

  beforeAll(() => {
    previousHome = process.env.WALLET_CLI_HOME;
    process.env.WALLET_CLI_HOME = mkdtempSync(join(tmpdir(), "wallet-cli-positional-"));
  });

  afterAll(() => {
    if (previousHome === undefined) delete process.env.WALLET_CLI_HOME;
    else process.env.WALLET_CLI_HOME = previousHome;
  });

  // Each runtime allows only one result emission.
  function newRuntime() {
    const runtime = composeCliRuntime({
      globals: { output: "json", verbose: false },
      secretPaths: {},
      startedAt: Date.now(),
      monotonicStart: performance.now(),
    });
    // Replace both prompter references to prevent real /dev/tty prompts on developer machines.
    const unreachable = (site: string) => () => {
      throw new Error(`positional-contract test must not prompt (${site})`);
    };
    const prompter = new Prompter({
      isTTY: () => false,
      question: unreachable("question"),
      readKey: unreachable("readKey"),
      write() {},
      beginRaw: unreachable("beginRaw"),
      endRaw() {},
    });
    runtime.deps.prompter = prompter;
    runtime.deps.secrets = new SecretResolver(runtime.streams, {}, prompter);
    return runtime;
  }

  function shellOpts(): ShellOptions {
    const runtime = newRuntime();
    return {
      registry: runtime.registry,
      globals: { output: "json", verbose: false },
      deps: runtime.deps,
      targetResolver: runtime.targetResolver,
      caps: runtime.capabilities,
      streams: runtime.streams,
      formatter: runtime.formatter,
      session: {} as SessionRef,
    };
  }

  function positionalCommands() {
    return newRuntime()
      .registry.all()
      .flatMap((c) => {
        const { path, positionals, fields } = isChainCommand(c)
          ? { path: c.spec.path, positionals: c.spec.positionals, fields: c.spec.baseFields }
          : { path: c.path, positionals: c.positionals, fields: c.fields };
        return positionals?.length ? [{ path, positionals, fields }] : [];
      });
  }

  it("finds the shipped positional commands (guards against an empty, vacuously-passing table)", () => {
    const found = positionalCommands()
      .map((c) => c.path.join(" "))
      .sort();
    expect(found).toEqual([
      "8004 add-operator",
      "8004 approve",
      "8004 operator-check",
      "8004 register",
      "8004 remove-operator",
      "8004 show",
      "8004 transfer",
      "8004 update",
      "asset info",
      "asset participate",
      "backup",
      "bai recharge",
      "bai report-recharge",
      "block",
      "config",
      "contact add",
      "contact remove",
      "contract clear-abi",
      "contract set-origin-energy-limit",
      "contract set-user-resource-percent",
      "delete",
      "encoding convert",
      "exchange inject",
      "exchange show",
      "exchange trade",
      "exchange withdraw",
      "gasfree trace",
      "import keystore",
      "proposal approve",
      "proposal delete",
      "proposal show",
      "rename",
      "sunpump buy",
      "sunpump sell",
      "sunpump token-info",
      "sunpump token-search",
      "sunswap pool-search",
      "sunswap price",
      "sunswap swap",
      "sunswap token-search",
      "use",
      "witness set-brokerage",
      "x402 pay",
    ]);
  });

  it("declares every positional as a real field of its own schema", () => {
    for (const cmd of positionalCommands()) {
      for (const p of cmd.positionals) {
        expect(Object.keys(cmd.fields.shape), `${cmd.path.join(" ")} → ${p.field}`).toContain(
          p.field,
        );
      }
    }
  });

  it("rejects --<field> for each positional of each command", async () => {
    for (const cmd of positionalCommands()) {
      for (const p of cmd.positionals) {
        // The global --account remains valid when it shares a positional's name.
        if (p.field === "account") continue;
        const kebab = p.field.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
        const tokens = [...cmd.path, `--${kebab}`, "x"];
        await expect(
          buildCli(shellOpts()).parseAsync(tokens),
          `${tokens.join(" ")} should be rejected`,
        ).rejects.toMatchObject({
          code: "invalid_option",
          message: `unknown option(s): --${kebab}`,
        });
      }
    }
  });

  it.each([
    [["config"], "no positionals"],
    [["config", "timeoutMs"], "first of two"],
  ])("accepts %s (%s)", async (tokens) => {
    await expect(buildCli(shellOpts()).parseAsync(tokens)).resolves.toBeDefined();
  });

  it("still enforces the positional count limit", async () => {
    await expect(buildCli(shellOpts()).parseAsync(["config", "a", "b", "c"])).rejects.toMatchObject(
      { message: /too many positional arguments for config/ },
    );
  });

  function accountRefusingCommands() {
    return newRuntime()
      .registry.all()
      .flatMap((c) =>
        isChainCommand(c) && c.spec.rejectsAccount !== undefined ? [c.spec.path] : [],
      );
  }

  it("refuses --account on every command that declares it does not take one", async () => {
    const paths = accountRefusingCommands();
    expect(paths.map((path) => path.join(" ")).sort()).toEqual([
      "sunpump launch",
      "sunpump token-info",
      "sunpump token-list",
      "sunpump token-search",
      "sunswap pool-list",
      "sunswap pool-search",
      "sunswap position-info",
      "sunswap price",
      "sunswap token-list",
      "sunswap token-search",
    ]);
    for (const path of paths) {
      await expect(
        buildCli(shellOpts()).parseAsync([...path, "--account", "main"]),
      ).rejects.toMatchObject({
        code: "invalid_option",
        message: new RegExp(`^${path.join(" ")} does not accept --account: `),
      });
    }
  });

  const commandPath = (c: StoredCommand) => (isChainCommand(c) ? c.spec.path : c.path);
  const commandFields = (c: StoredCommand): string[] =>
    isChainCommand(c)
      ? [
          ...Object.keys(c.spec.baseFields.shape),
          ...Object.values(c.families).flatMap((b) => Object.keys(b?.fields?.shape ?? {})),
        ]
      : Object.keys(c.fields.shape);

  it.each(["--wait", "--no-wait"])(
    "refuses %s on every command that submits no transaction to wait for",
    async (flag) => {
      const all = newRuntime().registry.all();
      const declined = all.filter((c) => {
        const spec = isChainCommand(c) ? c.spec : c;
        return spec.broadcasts === true && spec.rejectsWait !== undefined;
      });
      expect(declined.map((c) => commandPath(c).join(" ")).sort()).toEqual([
        "bai recharge",
        "x402 pay",
        "x402 roundtrip",
      ]);
      for (const c of all.filter((c) => !acceptsWaitFlags(isChainCommand(c) ? c.spec : c))) {
        const path = commandPath(c);
        await expect(buildCli(shellOpts()).parseAsync([...path, flag])).rejects.toMatchObject({
          code: "invalid_option",
          message: new RegExp(`^${path.join(" ")} does not accept ${flag}: `),
        });
      }
    },
  );

  it.each(["--wait", "--no-wait"])(
    "refuses %s with every mode that submits nothing",
    async (flag) => {
      const commands = newRuntime()
        .registry.all()
        .filter((c) => acceptsWaitFlags(isChainCommand(c) ? c.spec : c));
      const checked: string[] = [];
      for (const c of commands) {
        const path = commandPath(c);
        const extra = isChainCommand(c) ? c.spec.rejectsWaitWith : undefined;
        const fields = commandFields(c);
        for (const mode of ["dryRun", "buildOnly", "signOnly", ...(extra ? [extra] : [])]) {
          if (!fields.includes(mode)) continue;
          const modeFlag = `--${mode.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
          checked.push(`${path.join(" ")} ${modeFlag}`);
          await expect(
            buildCli(shellOpts()).parseAsync([...path, modeFlag, flag]),
          ).rejects.toMatchObject({
            code: "invalid_option",
            message: `${flag} cannot be used with ${modeFlag}, which submits no transaction`,
          });
        }
      }
      expect(checked).toEqual(
        expect.arrayContaining([
          "tx send --dry-run",
          "tx send --build-only",
          "tx send --sign-only",
          "tx broadcast --dry-run",
          "gasfree transfer --dry-run",
          "sunpump buy --quote",
          "sunpump sell --quote",
          "sunswap swap --quote",
        ]),
      );
    },
  );

  it("keeps the global --account usable on the commands whose positional shares its name", async () => {
    for (const cmd of positionalCommands().filter((c) =>
      c.positionals.some((p) => p.field === "account"),
    )) {
      await expect(
        buildCli(shellOpts()).parseAsync([...cmd.path, "--account", "no-such-account"]),
      ).rejects.not.toMatchObject({ code: "invalid_option" });
      await expect(
        buildCli(shellOpts()).parseAsync([...cmd.path, "positional", "--account", "flag"]),
      ).rejects.toMatchObject({ message: /both positionally and as --account/ });
    }
  });
});
