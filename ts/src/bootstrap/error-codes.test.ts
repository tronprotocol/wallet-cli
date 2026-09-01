import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ERROR_CODES, type ErrorCodeEntry } from "../domain/errors/codes.js";
import { EVM_REJECTION_CODES } from "../adapters/outbound/chain/evm/node-errors.js";
import { TRON_REJECTION_CODES } from "../adapters/outbound/chain/tron/node-errors.js";

/**
 * The drift guard behind the "single index" promise.
 *
 * A table of error codes maintained by hand is accurate on the day it is written and wrong a week
 * later — which is how the error-code table came to list nine codes the implementation never produces while thirty
 * it does produce went undocumented. So the index is checked against the source: every code the
 * code can throw must have an entry, and every entry must correspond to a code that still exists.
 *
 * It lives in bootstrap because it reads across every layer, which only the composition root may
 * do; the index itself stays in `domain/errors`, beside the errors it describes.
 */
const SRC = fileURLToPath(new URL("..", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.includes(".test.")
      ? [path]
      : [];
  });
}

/**
 * Every code minted at a literal in an error constructor, with the exit its class implies. The
 * single scanner behind both directions of the guard below — a ternary first argument (e.g.
 * `throw new ChainError(cond ? "a" : "b", …)`) mints one site per branch, both attributed to that
 * constructor's exit class, because both really are thrown by it. Scans every string literal
 * between the call's opening paren and its first top-level comma, so it does not pick up literals
 * from later arguments (the message), and skips a literal that is a comparison operand (e.g.
 * `field === "name" ? …`) rather than a branch value.
 */
function thrownSites(): Array<{ code: string; exit: 1 | 2; where: string }> {
  const callStart = /new (Usage|Execution|Chain|Wallet|Transport)Error\(/g;
  const sites: Array<{ code: string; exit: 1 | 2; where: string }> = [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(callStart)) {
      const start = match.index! + match[0].length;
      const comma = text.indexOf(",", start);
      const firstArg = text.slice(start, comma === -1 ? start : comma);
      const line = text.slice(0, match.index).split("\n").length;
      for (const literal of firstArg.matchAll(/"([a-z_0-9]+)"/g)) {
        const before = firstArg.slice(0, literal.index).trimEnd();
        if (before.endsWith("===") || before.endsWith("!==")) continue;
        sites.push({
          code: literal[1]!,
          exit: match[1] === "Usage" ? 2 : 1,
          where: `${file.slice(SRC.length)}:${line}`,
        });
      }
    }
  }
  return sites;
}

/** Codes thrown as literals. The two node-rejection tables build theirs from data, so they publish
 *  their own lists rather than being scraped. */
function producedCodes(): Set<string> {
  const codes = new Set<string>([...EVM_REJECTION_CODES, ...TRON_REJECTION_CODES]);
  for (const { code } of thrownSites()) codes.add(code);
  return codes;
}

describe("the error-code index", () => {
  it("has an entry for every code the source can throw", () => {
    const undocumented = [...producedCodes()].filter((code) => !(code in ERROR_CODES)).sort();
    expect(undocumented).toEqual([]);
  });

  // The other direction, so the index does not accumulate codes that were renamed or removed —
  // an agent branching on a code that can never arrive is writing dead handling.
  it("has no entry for a code nothing throws", () => {
    const produced = producedCodes();
    const stale = Object.keys(ERROR_CODES)
      .filter((code) => !produced.has(code))
      .sort();
    expect(stale).toEqual([]);
  });

  it("gives every code an exit class, a retry answer, and a one-line meaning", () => {
    for (const [code, entry] of Object.entries(ERROR_CODES)) {
      expect([1, 2, "either"], code).toContain(entry.exit);
      expect(["same", "changed", "later", "never"], code).toContain(entry.retry);
      expect(entry.meaning, code).toMatch(/^[a-z(]/);
      expect(entry.meaning, code).not.toMatch(/\n/);
    }
  });

  // exit 2 means "it will still be wrong on retry" (machine-interface.md). A code that says
  // otherwise has one of the two fields wrong, and filling them independently is how that gets
  // caught.
  it("never claims a usage error is retryable", () => {
    const contradictory = Object.entries(ERROR_CODES)
      .filter(([, e]) => e.exit === 2 && e.retry !== "never")
      .map(([code]) => code)
      .sort();
    expect(contradictory).toEqual([]);
  });

  // The class a throw site picks is its statement of intent; the table is the contract. When they
  // disagree one of them is wrong, and nothing else in the build can tell. `either` is the
  // documented escape hatch for the few codes that genuinely arise on both sides.
  it("throws every code at the exit class its entry declares", () => {
    const wrong = thrownSites()
      .filter(({ code, exit }) => {
        const entry = (ERROR_CODES as Record<string, ErrorCodeEntry | undefined>)[code];
        return entry !== undefined && entry.exit !== "either" && entry.exit !== exit;
      })
      .map(({ code, exit, where }) => `${code} thrown at exit ${exit} in ${where}`)
      .sort();
    expect(wrong).toEqual([]);
  });
});
