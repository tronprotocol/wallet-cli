/**
 * Every family's submit path must consult the broadcast guard.
 *
 * `--dry-run` is declared once on a command's shared spec and honoured separately by each family
 * binding, and nothing in the type system notices a binding that parses the flag and forwards
 * only the fields it happens to care about. That is how the EVM `tx broadcast` binding came to
 * submit real transactions under a flag documented as not submitting anything.
 *
 * The guard closes that class of bug — but only for the submit paths that actually ask it. A new
 * family gateway that implements `broadcast` without the call would reopen the hole silently, so
 * the requirement is checked here rather than left to review.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CHAIN_DIR = dirname(fileURLToPath(import.meta.url));

/** Method names that put bytes on the wire; a new one belongs in this list. */
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
    // A traversal that quietly matched nothing would pass every assertion below.
    expect(files.some((f) => f.endsWith("evm/evm.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("tron/tron.ts"))).toBe(true);
  });

  it("guards every submit path in every family gateway", () => {
    const unguarded: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(SUBMIT_METHOD)) {
        // The call must come before anything else the method does: a guard placed after the
        // first await has already let a request go.
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
