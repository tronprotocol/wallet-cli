import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { HelpService } from "./index.js";
import { isChainCommand, type StreamManager } from "../contracts/index.js";
import { composeCliRuntime } from "../../../../bootstrap/composition.js";

/**
 * Group help tags a sub-command with `(tron)` / `(evm)` when only that family can serve it.
 *
 * The tag is DERIVED from the registry, never written by hand, because §10.1 defines it as a
 * statement about the current bindings ("補齊後標註即摘掉"). A hand-maintained tag goes stale
 * silently and then lies: the root listing kept `chain (tron)` long after `chain node` and
 * `chain prices` gained EVM bindings. These tests pin the derivation, not a copy of the text.
 */
describe("group help family tags are derived from the registry", () => {
  let previousHome: string | undefined;

  beforeAll(() => {
    previousHome = process.env.WALLET_CLI_HOME;
    process.env.WALLET_CLI_HOME = mkdtempSync(join(tmpdir(), "wallet-cli-group-tags-"));
  });

  afterAll(() => {
    if (previousHome === undefined) delete process.env.WALLET_CLI_HOME;
    else process.env.WALLET_CLI_HOME = previousHome;
  });

  function groupHelp(group: string): {
    rows: Map<string, string>;
    families: Map<string, string[]>;
  } {
    const runtime = composeCliRuntime({
      globals: { output: "text", verbose: false },
      secretPaths: {},
      startedAt: Date.now(),
    });
    let text = "";
    const stream = {
      result(t: string) {
        text = t;
      },
      diagnostic() {},
      errorLine() {},
      event() {},
      readStdinOnce: () => "",
      warnings: () => [],
    } as unknown as StreamManager;
    new HelpService(runtime.registry, stream, "0.0.0").handleMeta([group, "--help"]);

    const rows = new Map<string, string>();
    let inCommands = false;
    for (const line of text.split("\n")) {
      if (line.startsWith("Commands:")) {
        inCommands = true;
        continue;
      }
      if (inCommands) {
        if (!line.trim()) break;
        const verb = line.trim().split(/\s+/)[0]!;
        rows.set(verb, /\((tron|evm)\)$/.exec(line.trimEnd())?.[1] ?? "");
      }
    }

    const families = new Map<string, string[]>();
    for (const c of runtime.registry.all()) {
      if (!isChainCommand(c) || c.spec.path[0] !== group) continue;
      families.set(
        c.spec.path[1]!,
        Object.entries(c.families)
          .filter(([, b]) => b !== undefined)
          .map(([f]) => f),
      );
    }
    return { rows, families };
  }

  it("tags a row only when exactly one family is bound to it", () => {
    for (const group of ["account", "chain", "tx", "contract", "token"]) {
      const { rows, families } = groupHelp(group);
      expect(rows.size).toBeGreaterThan(0);
      for (const [verb, tag] of rows) {
        const bound = families.get(verb) ?? [];
        expect(bound.length, `${group} ${verb} has no binding`).toBeGreaterThan(0);
        expect(tag, `${group} ${verb} bound to ${bound.join("+")}`).toBe(
          bound.length === 1 ? bound[0]! : "",
        );
      }
    }
  });

  it("does not repeat a group-level tag on every row of a single-family group", () => {
    // `asset` is TRON-only end to end, and the root listing already says so. A column whose
    // value never varies is noise, not information (§10.3: 其組 help 內部不再逐條重複).
    const { rows } = groupHelp("asset");
    expect(rows.size).toBeGreaterThan(1);
    expect([...rows.values()].every((tag) => tag === "")).toBe(true);
  });

  it("tags the mixed groups that actually need it", () => {
    // Spot-check the discriminating rows: these are the ones a reader relies on.
    expect(groupHelp("chain").rows.get("params")).toBe("tron");
    expect(groupHelp("chain").rows.get("node")).toBe("");
    expect(groupHelp("tx").rows.get("multisig")).toBe("tron");
    expect(groupHelp("tx").rows.get("send")).toBe("");
    expect(groupHelp("account").rows.get("history")).toBe("tron");
    expect(groupHelp("account").rows.get("portfolio")).toBe("");
  });
});
