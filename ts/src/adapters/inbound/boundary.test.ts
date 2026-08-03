import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * depcruise already forbids inbound → outbound, but it only sees the graph that survives
 * compilation: `import type` is erased, so a type-only edge across the boundary is invisible to it
 * (switching on `tsPreCompilationDeps` would catch it, but it also closes several type-only cycles
 * through the domain barrels and would fail `no-circular` for reasons unrelated to any boundary).
 *
 * The edge still matters. It names a concrete implementation where a port belongs, and it is the
 * thing a later refactor quietly turns into a runtime dependency — which is exactly how
 * `commands/tx.ts` came to reference the outbound `TransactionArtifactWriter` class directly.
 */
describe("inbound adapters do not name outbound implementations", () => {
  const INBOUND = new URL("./", import.meta.url).pathname;

  function sources(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? sources(join(directory, entry.name))
        : entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
          ? [join(directory, entry.name)]
          : []
    );
  }

  it("has no import of adapters/outbound, type-only included", () => {
    const offenders = sources(INBOUND)
      .map((path) => ({ path, text: readFileSync(path, "utf8") }))
      .filter(({ text }) => /from\s+"[^"]*adapters\/outbound\//.test(text)
        || /from\s+"(?:\.\.\/)+outbound\//.test(text))
      .map(({ path }) => relative(INBOUND, path));

    expect(offenders).toEqual([]);
  });
});
