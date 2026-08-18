import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildCli, type ShellOptions } from "./index.js";
import { isChainCommand, type SessionRef } from "../contracts/index.js";
import { composeCliRuntime } from "../../../../bootstrap/composition.js";
import { Prompter } from "../input/prompt/index.js";
import { SecretResolver } from "../input/secret/index.js";

/**
 * The other shell tests drive synthetic command definitions, which proves the mechanism but not
 * that any shipped command is wired to it. This one enumerates the REAL registry: every command
 * that declares positionals must reject the `--<field>` spelling of each one. New positional
 * commands are covered automatically — the table is derived, not hand-written.
 *
 * Rejection happens in assertKnownFlags, before run(), so nothing here touches the network,
 * the keystore, or a signing path.
 */
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

  // fresh per invocation: StreamManager permits one result emission, so a runtime cannot be shared
  // across commands that actually run.
  function newRuntime() {
    const runtime = composeCliRuntime({
      globals: { output: "json", verbose: false },
      secretPaths: {},
      startedAt: Date.now(),
    });
    // These two overrides are load-bearing, and only on a developer machine: `composeCliRuntime`
    // wires the real TtyBackend, which finds the controlling terminal and prompts on /dev/tty. The
    // `--account` case below dispatches `backup`/`delete`, whose passwordMode primes the master
    // password — with a real TTY that blocks forever (CI has no terminal, so it passes there).
    // Both lines are needed: dispatch prompts through deps.prompter, priming through deps.secrets'
    // own prompter reference. Any prompt reaching the backend is a bug in this test's assumptions,
    // so the backend throws rather than silently answering "" and passing for the wrong reason.
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
      "asset info",
      "asset participate",
      "backup",
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
      "use",
      "witness set-brokerage",
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
        // `account` is also a global flag, legitimately accepted everywhere (use/rename/delete/backup)
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

  // Optional positionals must stay omittable. `config` is the sharpest case: 0, 1 or 2 of them,
  // and it moved from a `config [key] [value]` yargs layout to the shared `[args..]` capture.
  // Both readings are local-only (no network, no keystore).
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

  // `use`/`rename`/`delete`/`backup` name their positional after the global --account. The global
  // stays valid; supplying both spellings at once is the case bindGroupedPositionals catches.
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
