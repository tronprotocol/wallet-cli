import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { z } from "zod";
import { permissionUpdateSpec } from "./permission.js";
import { governanceTxModeFields, tronTxModeFields, txModeFields } from "./shared.js";

// --permission-id and --expiration are TRON multi-signature concepts and live on the TRON
// binding's field set; these assertions are about their wording, which did not move.
const txModeAndTron = { ...txModeFields, ...tronTxModeFields };

describe("transaction option argv coercion", () => {
  it("accepts numeric --permission-id and --expiration values from argv", () => {
    const parsed = z.object(txModeAndTron).parse({
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

// These two flags exist only for multi-sign, and their help used to state neither what the values
// mean nor what the limits are. A co-signer reading `--help` could not tell which permission group
// to pass, nor that the collection window they were extending is capped at 24h.
describe("shared --permission-id / --expiration document their semantics", () => {
  const describeOf = (name: keyof typeof txModeAndTron): string =>
    (txModeAndTron[name] as { description?: string }).description ?? "";

  it("spells out what a permission group id means", () => {
    const text = describeOf("permissionId");
    expect(text).toContain("0=owner");
    expect(text).toContain("1=witness");
    expect(text).toContain("2-9=active");
  });

  it("states the expiration cap, and quotes the number the schema actually enforces", () => {
    const schema = z.object(txModeAndTron);
    expect(schema.safeParse({ buildOnly: true, expiration: 86_400_000 }).success).toBe(true);
    expect(schema.safeParse({ buildOnly: true, expiration: 86_400_001 }).success).toBe(false);
    // the description must quote that same bound — a stale number here is worse than none
    expect(describeOf("expiration")).toContain("86400000");
    expect(describeOf("expiration")).toContain("24h");
  });

  it("says what happens when --expiration is omitted", () => {
    expect(describeOf("expiration")).toMatch(/node default.*60s/);
  });

  // --build-only produces an artifact nobody can use without knowing what consumes it. Both
  // multi-sig routes start here — the hex relay through `tx sign` and the TronLink queue through
  // `tx multisig` (docs/commands/tx/index.md) — so naming only one of them would be worse than
  // naming neither: it reads as "this flag is for the service path".
  it("says what the unsigned hex is for, and does not narrow it to one route", () => {
    const text = describeOf("buildOnly");
    expect(text).toMatch(/tx sign/);
    expect(text).toMatch(/tx multisig/);
  });

  // permission update carries its own copies of these fields; two copies of a description drift.
  it("permission update shows the same text, not a stale copy", () => {
    const shape = permissionUpdateSpec.baseFields.shape as Record<string, { description?: string }>;
    expect(shape.permissionId?.description).toBe(describeOf("permissionId"));
    expect(shape.expiration?.description).toBe(describeOf("expiration"));
    expect(shape.buildOnly?.description).toBe(describeOf("buildOnly"));
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
        : entry.name.endsWith(".md")
          ? [join(directory, entry.name)]
          : [],
    );
  }

  // Presence is not enough. These two rows carried the pre-A-2/A-3 wording — a permission id with
  // no key to its values, and a range with no readable bound — so a reader who went to the
  // reference page instead of `--help` still could not tell which group to pass.
  it("every --permission-id row carries the same value key the flag's help does", () => {
    // taken from the schema, not restated here: one wording, two surfaces
    const key = /\((0=owner[^)]*)\)/.exec(
      (tronTxModeFields.permissionId as { description?: string }).description ?? "",
    )?.[1];
    expect(key).toBeTruthy();

    const behind = pages(DOCS)
      .map((path) => ({
        path,
        rows: readFileSync(path, "utf8")
          .split("\n")
          .filter((l) => l.startsWith("| `--permission-id")),
      }))
      .filter(({ rows }) => rows.some((row) => !row.includes(key!)))
      .map(({ path }) => relative(DOCS, path));

    expect(behind).toEqual([]);
  });

  it("every --expiration row gives the readable cap and the omitted-case default", () => {
    const behind = pages(DOCS)
      .map((path) => ({
        path,
        rows: readFileSync(path, "utf8")
          .split("\n")
          .filter((l) => l.startsWith("| `--expiration")),
      }))
      .filter(({ rows }) =>
        rows.some((row) => !(row.includes("24h") && /node default.*60s/.test(row))),
      )
      .map(({ path }) => relative(DOCS, path));

    expect(behind).toEqual([]);
  });

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

/**
 * The governance group re-declared `--permission-id` with an int32 ceiling, so `--help` advertised a
 * range the application layer then refused: `transactionMode()` accepts 0..9 and rejects anything
 * above it with `invalid_option`, after the command has already started. TRON has at most eight
 * active permissions (ids 2..9) plus owner (0), so 0..9 is the real bound and the override was
 * simply wrong — it also downgraded the failure from a schema `invalid_value` to a runtime
 * `invalid_option`, classifying the same mistake differently from every non-governance command.
 */
describe("governance --permission-id shares the protocol bound with every other command", () => {
  const field = (fields: Record<string, unknown>) => z.object(fields as never);

  it("rejects a permission id above the protocol maximum, as the TRON field set does", () => {
    expect(field(governanceTxModeFields).safeParse({ permissionId: "10" }).success).toBe(false);
    // The bound lives with the flag, which is TRON-only: a permission group is a TRON concept,
    // so the shared set no longer declares it at all.
    expect(field(tronTxModeFields).safeParse({ permissionId: "10" }).success).toBe(false);
    expect(Object.keys(txModeFields)).not.toContain("permissionId");
  });

  it("still accepts the whole valid range", () => {
    for (const id of ["0", "2", "9"]) {
      expect(field(governanceTxModeFields).safeParse({ permissionId: id }).success).toBe(true);
    }
  });
});
