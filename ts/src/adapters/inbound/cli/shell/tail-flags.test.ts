import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { assertNoTailFlags, YARGS_TAIL_KEYS } from "./index.js";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isChainCommand } from "../contracts/index.js";
import { composeCliRuntime } from "../../../../bootstrap/composition.js";

describe("assertNoTailFlags", () => {
  it.each([...YARGS_TAIL_KEYS])("rejects --%s typed by the user", (name) => {
    expect(() => assertNoTailFlags(["contract", "call", `--${name}`, "x"])).toThrow(
      new RegExp(`--${name}`),
    );
  });

  it("rejects the --key=value form too", () => {
    expect(() => assertNoTailFlags(["use", "--args=main"])).toThrow(/--args/);
  });

  it("names every offending flag at once", () => {
    try {
      assertNoTailFlags(["list", "--args", "a", "--verb", "b"]);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as Error).message).toContain("--args");
      expect((error as Error).message).toContain("--verb");
    }
  });

  it("leaves the ordinary command line alone", () => {
    expect(() =>
      assertNoTailFlags(["tx", "send", "--to", "T…", "--amount", "1", "--network", "nile"]),
    ).not.toThrow();
  });

  // Only a whole flag name counts: `--arguments` is someone else's flag, not this one.
  it("does not match a longer flag that merely starts with a tail key", () => {
    expect(() => assertNoTailFlags(["x", "--arguments", "1", "--verbose"])).not.toThrow();
  });

  // A value that happens to spell a flag is a value.
  it("stops scanning at a bare --", () => {
    expect(() => assertNoTailFlags(["x", "--", "--args", "y"])).not.toThrow();
  });
});

// The blanket rejection above is only safe while no command wants these names as real flags.
// If one ever does, this fails and points at the trade-off rather than letting the flag be
// silently unreachable.
describe("no command declares a field named after a yargs tail key", () => {
  let previousHome: string | undefined;

  beforeAll(() => {
    previousHome = process.env.WALLET_CLI_HOME;
    process.env.WALLET_CLI_HOME = mkdtempSync(join(tmpdir(), "wallet-cli-tail-flags-"));
  });

  afterAll(() => {
    if (previousHome === undefined) delete process.env.WALLET_CLI_HOME;
    else process.env.WALLET_CLI_HOME = previousHome;
  });

  it("holds across the whole registry", () => {
    const runtime = composeCliRuntime({
      globals: { output: "text", verbose: false },
      secretPaths: {},
      startedAt: Date.now(),
    });
    const offenders: string[] = [];
    for (const cmd of runtime.registry.all()) {
      const path = (isChainCommand(cmd) ? cmd.spec.path : cmd.path).join(" ");
      const shapes = isChainCommand(cmd)
        ? [
            cmd.spec.baseFields.shape,
            ...Object.values(cmd.families).flatMap((b) => (b?.fields ? [b.fields.shape] : [])),
          ]
        : [cmd.fields.shape];
      for (const shape of shapes) {
        for (const key of Object.keys(shape)) {
          if ((YARGS_TAIL_KEYS as readonly string[]).includes(key)) offenders.push(`${path}.${key}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
