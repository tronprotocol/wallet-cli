import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ERROR_CODES, type ErrorCodeEntry } from "../domain/errors/codes.js";
import { EVM_REJECTION_CODES } from "../adapters/outbound/chain/evm/node-errors.js";
import { TRON_REJECTION_CODES } from "../adapters/outbound/chain/tron/node-errors.js";

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

// Scan literals up to the first comma; nested expressions are not parsed.
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

// Node-rejection codes come from tables rather than literal throw sites.
function producedCodes(): Set<string> {
  const codes = new Set<string>([...EVM_REJECTION_CODES, ...TRON_REJECTION_CODES]);
  for (const { code } of thrownSites()) codes.add(code);
  // Schema refinements declare error codes without literal error constructors.
  const declared = /errorCode:\s*"([a-z_0-9]+)"/g;
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(declared)) codes.add(match[1]!);
  }
  return codes;
}

describe("the error-code index", () => {
  it("has an entry for every code the source can throw", () => {
    const undocumented = [...producedCodes()].filter((code) => !(code in ERROR_CODES)).sort();
    expect(undocumented).toEqual([]);
  });

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

  it("never claims a usage error is retryable", () => {
    const contradictory = Object.entries(ERROR_CODES)
      .filter(([, e]) => e.exit === 2 && e.retry !== "never")
      .map(([code]) => code)
      .sort();
    expect(contradictory).toEqual([]);
  });

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

  it("declares every node-rejection code at exit 1, since they are always thrown via ChainError", () => {
    const rejectionCodes = new Set([...EVM_REJECTION_CODES, ...TRON_REJECTION_CODES]);
    const wrong = [...rejectionCodes]
      .filter(
        (code) => (ERROR_CODES as Record<string, ErrorCodeEntry | undefined>)[code]?.exit !== 1,
      )
      .sort();
    expect(wrong).toEqual([]);
  });
});
