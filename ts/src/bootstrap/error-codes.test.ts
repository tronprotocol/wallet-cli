import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ERROR_CODES } from "../domain/errors/codes.js";
import { EVM_REJECTION_CODES } from "../adapters/outbound/chain/evm/node-errors.js";
import { TRON_REJECTION_CODES } from "../adapters/outbound/chain/tron/node-errors.js";

/**
 * The drift guard behind the "single index" promise.
 *
 * A table of error codes maintained by hand is accurate on the day it is written and wrong a week
 * later — which is how §11 came to list nine codes the implementation never produces while thirty
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

/** Codes thrown as literals. The two node-rejection tables build theirs from data, so they publish
 *  their own lists rather than being scraped. */
function producedCodes(): Set<string> {
  const thrown = /new (?:Usage|Execution|Chain|Wallet|Transport)Error\(\s*"([a-z_0-9]+)"/g;
  const codes = new Set<string>([...EVM_REJECTION_CODES, ...TRON_REJECTION_CODES]);
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(thrown)) codes.add(match[1]!);
  }
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

  it("gives every code a one-line meaning", () => {
    for (const [code, meaning] of Object.entries(ERROR_CODES)) {
      expect(meaning, code).toMatch(/^[a-z(]/);
      expect(meaning, code).not.toMatch(/\n/);
    }
  });
});
