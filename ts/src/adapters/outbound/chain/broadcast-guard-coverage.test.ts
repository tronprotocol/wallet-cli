import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CHAIN_DIR = dirname(fileURLToPath(import.meta.url));

// Add new transaction-submission method names here to include them in coverage.
const SUBMIT_METHOD = /\basync\s+(broadcast|broadcastHex|sendRawTransaction)\s*\(/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.includes(".test.")
      ? [path]
      : [];
  });
}

describe("broadcast guard coverage", () => {
  const files = sourceFiles(CHAIN_DIR);

  it("finds the family gateways it is meant to be checking", () => {
    expect(files.some((f) => f.endsWith("evm/evm.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("tron/tron.ts"))).toBe(true);
  });

  it("guards every submit path in every family gateway", () => {
    const unguarded: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(SUBMIT_METHOD)) {
        // Require the guard before the first await in the method prefix.
        const body = source.slice(
          match.index + match[0].length,
          match.index + match[0].length + 400,
        );
        const guardAt = body.indexOf("assertBroadcastAllowed()");
        const awaitAt = body.indexOf("await ");
        if (guardAt === -1 || (awaitAt !== -1 && awaitAt < guardAt)) {
          unguarded.push(`${file}: ${match[1]}`);
        }
      }
    }

    expect(unguarded).toEqual([]);
  });
});
