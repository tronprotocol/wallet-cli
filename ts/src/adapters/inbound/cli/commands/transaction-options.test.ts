import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { z } from "zod";
import { permissionUpdateSpec } from "./permission.js";
import { txModeFields } from "./shared.js";

describe("transaction option argv coercion", () => {
  it("accepts numeric --permission-id and --expiration values from argv", () => {
    const parsed = z.object(txModeFields).parse({
      buildOnly: true,
      permissionId: "2",
      expiration: "86400000",
    });

    expect(parsed.permissionId).toBe(2);
    expect(parsed.expiration).toBe(86_400_000);
  });

  it("applies the same argv coercion to permission update", () => {
    const parsed = permissionUpdateSpec.baseFields.parse({
      file: "permissions.json",
      buildOnly: true,
      permissionId: "2",
      expiration: "60000",
    });

    expect(parsed.permissionId).toBe(2);
    expect(parsed.expiration).toBe(60_000);
  });
});

// `txModeFields` is shared, so adding a flag to it silently widens 14 commands at once while their
// individual reference pages stay behind — which is exactly how --build-only / --permission-id /
// --expiration ended up documented on only 3 of the 14. A page that documents the transaction modes
// at all must document all of them.
describe("reference pages keep up with the shared transaction options", () => {
  const DOCS = new URL("../../../../../docs/commands/", import.meta.url).pathname;
  const REQUIRED = ["--build-only", "--permission-id", "--expiration"];

  function pages(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? pages(join(directory, entry.name))
        : entry.name.endsWith(".md") ? [join(directory, entry.name)] : []
    );
  }

  it("every page offering --sign-only also documents the rest of the shared modes", () => {
    const behind = pages(DOCS)
      .map((path) => ({ path, text: readFileSync(path, "utf8") }))
      // An Options-table ROW for --sign-only means the command itself carries the shared object;
      // prose mentions (tx/index, tx/sign) merely refer to other commands and must not be flagged.
      .filter(({ text }) => /^\| `--sign-only`/m.test(text))
      .filter(({ text }) => REQUIRED.some((flag) => !text.includes(flag)))
      .map(({ path }) => relative(DOCS, path));

    expect(behind).toEqual([]);
  });
});
