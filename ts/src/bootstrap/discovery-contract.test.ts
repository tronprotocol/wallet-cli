import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { main, VERSION } from "./runner.js";
import { composeCliRuntime } from "./composition.js";
import { isChainCommand } from "../adapters/inbound/cli/contracts/index.js";
import { chainInputSchema } from "../adapters/inbound/cli/shell/index.js";
import { GLOBAL_FLAG_SPECS, globalFlagField } from "../adapters/inbound/cli/globals/index.js";

// File snapshots of the published discovery and envelope contract (rule 4.3). A change here is a contract decision.

let previousHome: string | undefined;

beforeAll(() => {
  previousHome = process.env.WALLET_CLI_HOME;
  process.env.WALLET_CLI_HOME = mkdtempSync(join(tmpdir(), "wallet-cli-contract-"));
});

afterAll(() => {
  if (previousHome === undefined) delete process.env.WALLET_CLI_HOME;
  else process.env.WALLET_CLI_HOME = previousHome;
});

async function stdoutOf(args: string[]): Promise<{ exit: number; out: string }> {
  let out = "";
  const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
  const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    const exit = await main(["node", "wallet-cli", ...args]);
    return { exit, out };
  } finally {
    write.mockRestore();
    err.mockRestore();
  }
}

function normalized(text: string): string {
  const value = JSON.parse(text) as Record<string, unknown>;
  if (value.version === VERSION) value.version = "<version>";
  const meta = value.meta as { durationMs?: number } | undefined;
  if (meta?.durationMs !== undefined) meta.durationMs = 0;
  return `${JSON.stringify(value, null, 2)}\n`;
}

describe("discovery contract snapshots", () => {
  it.each([
    ["root", []],
    ["tron", ["tron"]],
    ["evm", ["evm"]],
  ])("--json-schema catalog: %s", async (name, scope) => {
    const { exit, out } = await stdoutOf([...scope, "--json-schema"]);
    expect(exit).toBe(0);
    await expect(normalized(out)).toMatchFileSnapshot(`__snapshots__/json-schema.${name}.json`);
  });
});

describe("envelope contract snapshots", () => {
  it("success envelope", async () => {
    const { exit, out } = await stdoutOf(["--output", "json", "networks"]);
    expect(exit).toBe(0);
    await expect(normalized(out)).toMatchFileSnapshot("__snapshots__/envelope.success.json");
  });

  it("error envelope", async () => {
    const { exit, out } = await stdoutOf([
      "--output",
      "json",
      "--network",
      "shasta",
      "gasfree",
      "info",
    ]);
    expect(exit).toBe(2);
    await expect(normalized(out)).toMatchFileSnapshot("__snapshots__/envelope.error.json");
  });
});

describe("every registered exclusive group", () => {
  const stdinFlags = new Set(GLOBAL_FLAG_SPECS.filter((f) => f.commandScoped).map((f) => f.name));

  function declarations() {
    const registry = composeCliRuntime({
      globals: { output: "json", verbose: false },
      secretPaths: {},
      startedAt: Date.now(),
      monotonicStart: performance.now(),
    }).registry;
    return registry.all().flatMap((cmd) => {
      if (!isChainCommand(cmd)) {
        return cmd.exclusive?.length
          ? [{ name: cmd.path.join(" "), groups: cmd.exclusive, fields: [cmd.fields] }]
          : [];
      }
      if (!cmd.spec.exclusive?.length) return [];
      const fields = Object.values(cmd.families).map((b) => chainInputSchema(cmd.spec, b!).fields);
      return [{ name: cmd.spec.path.join(" "), groups: cmd.spec.exclusive, fields }];
    });
  }

  it("finds the declared groups", () => {
    expect(declarations().length).toBeGreaterThanOrEqual(20);
  });

  it("declares the transaction-mode group over exactly the mode flags a command accepts", () => {
    const registry = composeCliRuntime({
      globals: { output: "json", verbose: false },
      secretPaths: {},
      startedAt: Date.now(),
      monotonicStart: performance.now(),
    }).registry;
    const modeFields = ["dryRun", "signOnly", "buildOnly"];
    let checked = 0;
    for (const cmd of registry.all()) {
      const fieldSets = isChainCommand(cmd)
        ? Object.values(cmd.families).map((b) => chainInputSchema(cmd.spec, b!).fields)
        : [cmd.fields];
      const accepted = modeFields.filter((m) => fieldSets.some((f) => m in f.shape));
      if (accepted.length < 2) continue;
      checked++;
      const groups = (isChainCommand(cmd) ? cmd.spec.exclusive : cmd.exclusive) ?? [];
      const name = (isChainCommand(cmd) ? cmd.spec.path : cmd.path).join(" ");
      const expected = accepted.map((m) => m.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
      expect(
        groups.some((g) => g.flags.join() === expected.join()),
        name,
      ).toBe(true);
    }
    expect(checked).toBeGreaterThanOrEqual(40);
  });

  it("names only flags that some family accepts", () => {
    for (const { name, groups, fields } of declarations()) {
      for (const flag of groups.flatMap((g) => g.flags)) {
        const known = stdinFlags.has(flag) || fields.some((f) => globalFlagField(flag) in f.shape);
        expect(known, `${name}: --${flag}`).toBe(true);
      }
    }
  });
});
