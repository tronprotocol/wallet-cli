import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { isChainCommand } from "../contracts/index.js";
import { GLOBAL_FLAGS, inputFlagsFor } from "./catalog.js";
import { composeCliRuntime } from "../../../../bootstrap/composition.js";

/**
 * Every flag used in a help Example must be a flag the command actually declares.
 *
 * Examples are the part of help people copy verbatim, and nothing keeps them honest when a flag
 * is renamed: `contract deploy` advertised `--bytecode` and `--params` for a whole release after
 * the v4.13.0 rename moved them to `--code` / `--code-file` / `--constructor-params`, so the one
 * line a reader was most likely to paste was the one line guaranteed to fail with
 * `unknown option`. A renamed flag now fails here instead of in someone's terminal.
 */
describe("help examples only use flags the command declares", () => {
  let previousHome: string | undefined;

  beforeAll(() => {
    previousHome = process.env.WALLET_CLI_HOME;
    process.env.WALLET_CLI_HOME = mkdtempSync(join(tmpdir(), "wallet-cli-examples-"));
  });

  afterAll(() => {
    if (previousHome === undefined) delete process.env.WALLET_CLI_HOME;
    else process.env.WALLET_CLI_HOME = previousHome;
  });

  /** zod field names are camelCase; the CLI spells them kebab-case. */
  const kebab = (name: string): string => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

  function declaredFlags(
    cmd: ReturnType<typeof composeCliRuntime>["registry"] extends never ? never : any,
  ): Set<string> {
    const out = new Set<string>();
    for (const g of GLOBAL_FLAGS) out.add(g.flag.replace(/^--/, ""));
    for (const g of inputFlagsFor(isChainCommand(cmd) ? cmd.spec : cmd))
      out.add(g.flag.replace(/^--/, ""));
    const shapes: z.ZodRawShape[] = [];
    if (isChainCommand(cmd)) {
      shapes.push(cmd.spec.baseFields.shape);
      for (const binding of Object.values(cmd.families))
        if (binding?.fields) shapes.push(binding.fields.shape);
    } else {
      shapes.push(cmd.fields.shape);
    }
    for (const shape of shapes) for (const name of Object.keys(shape)) out.add(kebab(name));
    return out;
  }

  it("names no flag that does not exist on the command", () => {
    const runtime = composeCliRuntime({
      globals: { output: "text", verbose: false },
      secretPaths: {},
      startedAt: Date.now(),
    });

    const offenders: string[] = [];
    for (const cmd of runtime.registry.all()) {
      const path = (isChainCommand(cmd) ? cmd.spec.path : cmd.path).join(" ");
      const examples = (isChainCommand(cmd) ? cmd.spec.examples : cmd.examples) ?? [];
      const allowed = declaredFlags(cmd);
      for (const example of examples) {
        // Long flags only. Short aliases (-o) and shell redirection are not command flags.
        for (const [, flag] of example.cmd.matchAll(/(?:^|\s)--([a-z0-9][a-z0-9-]*)/g)) {
          if (!allowed.has(flag!)) offenders.push(`${path}: --${flag} (in "${example.cmd}")`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
