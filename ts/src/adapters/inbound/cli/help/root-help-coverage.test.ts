import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { HelpService } from "./index.js";
import { isChainCommand, type StreamManager } from "../contracts/index.js";
import { composeCliRuntime } from "../../../../bootstrap/composition.js";

describe("wallet-cli --help lists every registered top-level command", () => {
  let previousHome: string | undefined;

  beforeAll(() => {
    previousHome = process.env.WALLET_CLI_HOME;
    process.env.WALLET_CLI_HOME = mkdtempSync(join(tmpdir(), "wallet-cli-root-help-"));
  });

  afterAll(() => {
    if (previousHome === undefined) delete process.env.WALLET_CLI_HOME;
    else process.env.WALLET_CLI_HOME = previousHome;
  });

  function rootHelp(tokens = ["--help"]): { text: string; heads: string[] } {
    const runtime = composeCliRuntime({
      globals: { output: "text", verbose: false },
      secretPaths: {},
      startedAt: Date.now(),
      monotonicStart: performance.now(),
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
    new HelpService(runtime.registry, stream, "0.0.0").handleMeta(tokens);
    const heads = [
      ...new Set(runtime.registry.all().map((c) => (isChainCommand(c) ? c.spec.path : c.path)[0]!)),
    ].sort();
    return { text, heads };
  }

  it("names every top-level group somewhere in the root listing", () => {
    const { text, heads } = rootHelp();
    // Match listing rows so prose cannot mask a missing command.
    const listed = new Set(
      text
        .split("\n")
        .map((line) => /^ {2}([a-z0-9][a-z0-9-]*)\s{2,}\S/.exec(line)?.[1])
        .filter((name): name is string => name !== undefined),
    );
    expect(heads.filter((head) => !listed.has(head))).toEqual([]);
  });

  it("covers the TRC10 and governance groups specifically", () => {
    const { text } = rootHelp();
    for (const group of ["asset", "exchange", "proposal", "witness"]) {
      expect(text, `${group} missing from wallet-cli --help`).toMatch(
        new RegExp(`^ {2}${group}\\s{2,}\\S`, "m"),
      );
    }
  });
  it("lists chain and neutral BAI commands together exactly once", () => {
    const { text } = rootHelp(["bai", "--help"]);
    for (const verb of [
      "recharge",
      "report-recharge",
      "usage-summary",
      "usage-records",
      "recharge-orders",
    ]) {
      expect(text.match(new RegExp(`^ {2}${verb}\\s+`, "gm")), verb).toHaveLength(1);
    }
  });
});
