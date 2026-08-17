import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { HelpService } from "./index.js";
import { isChainCommand, type StreamManager } from "../contracts/index.js";
import { composeCliRuntime } from "../../../../bootstrap/composition.js";

/**
 * `wallet-cli --help` is where discovery starts, and its three group tables are HAND-WRITTEN
 * (help/index.ts #renderRoot) rather than derived from the registry. That list has already fallen
 * behind twice — `asset` / `exchange` and the governance groups each shipped registered, working,
 * and invisible at the root. For an agent-first CLI a command that cannot be found is a command
 * that cannot be used, so this test enumerates the REAL registry and fails when a top-level group
 * is missing from the root listing.
 *
 * It deliberately does not check descriptions or ordering — those are editorial. Only presence.
 */
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

  function rootHelp(): { text: string; heads: string[] } {
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
    new HelpService(runtime.registry, stream, "0.0.0").handleMeta(["--help"]);
    // every command's FIRST path segment — the name a user types to explore further
    const heads = [
      ...new Set(runtime.registry.all().map((c) => (isChainCommand(c) ? c.spec.path : c.path)[0]!)),
    ].sort();
    return { text, heads };
  }

  it("names every top-level group somewhere in the root listing", () => {
    const { text, heads } = rootHelp();
    // match the listing column only, so a name appearing inside prose cannot mask a missing row
    const listed = new Set(
      text
        .split("\n")
        .map((line) => /^ {2}([a-z][a-z0-9-]*)\s{2,}\S/.exec(line)?.[1])
        .filter((name): name is string => name !== undefined),
    );
    expect(heads.filter((head) => !listed.has(head))).toEqual([]);
  });

  it("covers the v4.12.0 additions specifically", () => {
    const { text } = rootHelp();
    for (const group of ["asset", "exchange", "proposal", "witness"]) {
      expect(text, `${group} missing from wallet-cli --help`).toMatch(
        new RegExp(`^ {2}${group}\\s{2,}\\S`, "m"),
      );
    }
  });
});
