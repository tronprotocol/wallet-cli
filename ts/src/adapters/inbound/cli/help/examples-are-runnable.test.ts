import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { isChainCommand } from "../contracts/index.js";
import { GLOBAL_FLAGS, inputFlagsFor } from "./catalog.js";
import { composeCliRuntime } from "../../../../bootstrap/composition.js";

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
      monotonicStart: performance.now(),
    });

    const offenders: string[] = [];
    for (const cmd of runtime.registry.all()) {
      const path = (isChainCommand(cmd) ? cmd.spec.path : cmd.path).join(" ");
      const examples = (isChainCommand(cmd) ? cmd.spec.examples : cmd.examples) ?? [];
      const allowed = declaredFlags(cmd);
      for (const example of examples) {
        // Check long flags; short aliases and redirection are outside this check.
        for (const [, flag] of example.cmd.matchAll(/(?:^|\s)--([a-z0-9][a-z0-9-]*)/g)) {
          if (!allowed.has(flag!)) offenders.push(`${path}: --${flag} (in "${example.cmd}")`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
