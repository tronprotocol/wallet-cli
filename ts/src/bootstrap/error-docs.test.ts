import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ERROR_CODES, type ErrorCodeEntry } from "../domain/errors/codes.js";

/**
 * The two "common codes at exit N" tables in machine-interface.md are prose, and prose drifts —
 * the same failure mode codes.ts already fixed for the code vocabulary. This checks the tables
 * against the index rather than against a reader's memory.
 */
const DOC = fileURLToPath(new URL("../../docs/machine-interface.md", import.meta.url));

function tableCodes(start: string, end: string): Set<string> {
  const text = readFileSync(DOC, "utf8");
  const segment = text.split(start)[1]!.split(end)[0]!;
  const codes = new Set<string>();
  for (const line of segment.split("\n")) {
    if (!line.startsWith("|")) continue;
    for (const match of line.split("|")[1]!.matchAll(/`([a-z_0-9]+)`/g)) codes.add(match[1]!);
  }
  return codes;
}

describe("the exit-code tables in machine-interface.md", () => {
  it("lists each code under the exit class its entry declares", () => {
    const at2 = tableCodes("Common codes at exit **2**", "Common codes at exit **1**");
    const at1 = tableCodes("Common codes at exit **1**", "Unexpected exceptions are");
    const wrong: string[] = [];
    for (const [code, expected] of [
      ...[...at2].map((c) => [c, 2] as const),
      ...[...at1].map((c) => [c, 1] as const),
    ]) {
      const entry = (ERROR_CODES as Record<string, ErrorCodeEntry | undefined>)[code];
      if (entry === undefined) {
        wrong.push(`${code} is in the exit ${expected} table but not in the index`);
      } else if (entry.exit !== "either" && entry.exit !== expected) {
        wrong.push(`${code} is documented at exit ${expected} but declared exit ${entry.exit}`);
      }
    }
    expect(wrong.sort()).toEqual([]);
  });
});
