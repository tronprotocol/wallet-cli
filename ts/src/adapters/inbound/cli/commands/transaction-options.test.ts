import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { z } from "zod";
import { permissionUpdateSpec } from "./permission.js";
import { accountActivateSpec, accountSetSpec } from "./account.js";
import {
  assetIssueSpec,
  assetParticipateSpec,
  assetUnfreezeSpec,
  assetUpdateSpec,
} from "./asset.js";
import {
  exchangeCreateSpec,
  exchangeInjectSpec,
  exchangeTradeSpec,
  exchangeWithdrawSpec,
} from "./exchange.js";
import { rewardWithdrawSpec } from "./reward.js";
import { stakeDefinitions } from "./stake.js";
import { voteCastSpec } from "./vote.js";
import type { ChainSpec } from "../contracts/index.js";
import { governanceTxModeFields, tronTxModeFields, txModeFields } from "./shared.js";

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
    expect(describeOf("expiration")).toContain("86400000");
    expect(describeOf("expiration")).toContain("24h");
  });

  it("says what happens when --expiration is omitted", () => {
    expect(describeOf("expiration")).toMatch(/node default.*60s/);
  });

  it("says what the unsigned hex is for, and does not narrow it to one route", () => {
    const text = describeOf("buildOnly");
    expect(text).toMatch(/tx sign/);
    expect(text).toMatch(/tx multisig/);
  });

  it("permission update shows the same text, not a stale copy", () => {
    const shape = permissionUpdateSpec.baseFields.shape as Record<string, { description?: string }>;
    expect(shape.permissionId?.description).toBe(describeOf("permissionId"));
    expect(shape.expiration?.description).toBe(describeOf("expiration"));
    expect(shape.buildOnly?.description).toBe(describeOf("buildOnly"));
  });
});

describe("reference pages keep up with the shared transaction options", () => {
  const DOCS = fileURLToPath(new URL("../../../../../docs/commands/", import.meta.url));
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

  it("every --permission-id row carries the same value key the flag's help does", () => {
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
      // Match option rows; prose may refer to flags on other commands.
      .filter(({ text }) => /^\| `--sign-only`/m.test(text))
      .filter(({ text }) => REQUIRED.some((flag) => !text.includes(flag)))
      .map(({ path }) => relative(DOCS, path));

    expect(behind).toEqual([]);
  });
});

describe("governance --permission-id shares the protocol bound with every other command", () => {
  const field = (fields: Record<string, unknown>) => z.object(fields as never);

  it("rejects a permission id above the protocol maximum, as the TRON field set does", () => {
    expect(field(governanceTxModeFields).safeParse({ permissionId: "10" }).success).toBe(false);
    expect(field(tronTxModeFields).safeParse({ permissionId: "10" }).success).toBe(false);
    expect(Object.keys(txModeFields)).not.toContain("permissionId");
  });

  it("still accepts the whole valid range", () => {
    for (const id of ["0", "2", "9"]) {
      expect(field(governanceTxModeFields).safeParse({ permissionId: id }).success).toBe(true);
    }
  });
});

describe("TRON-only writes still carry the multi-signature transaction options", () => {
  const specs: Array<[string, ChainSpec]> = [
    ["account activate", accountActivateSpec],
    ["account set", accountSetSpec],
    ["asset issue", assetIssueSpec],
    ["asset participate", assetParticipateSpec],
    ["asset unfreeze", assetUnfreezeSpec],
    ["asset update", assetUpdateSpec],
    ["exchange create", exchangeCreateSpec],
    ["exchange inject", exchangeInjectSpec],
    ["exchange trade", exchangeTradeSpec],
    ["exchange withdraw", exchangeWithdrawSpec],
    ["reward withdraw", rewardWithdrawSpec],
    ["vote cast", voteCastSpec],
    ...stakeDefinitions({} as never)
      .filter(({ spec }) => spec.broadcasts)
      .map(({ spec }) => [spec.path.join(" "), spec] as [string, ChainSpec]),
  ];

  it.each(specs)("%s declares both flags", (_name, spec) => {
    const shape = spec.baseFields.shape as Record<string, unknown>;
    expect(Object.keys(shape)).toEqual(expect.arrayContaining(["permissionId", "expiration"]));
  });

  it.each(specs)("%s reuses the shared field definitions verbatim", (_name, spec) => {
    const shape = spec.baseFields.shape as Record<string, unknown>;
    expect(shape.permissionId).toBe(tronTxModeFields.permissionId);
    expect(shape.expiration).toBe(tronTxModeFields.expiration);
  });

  it.each(specs)("%s keeps the shared --build-only description", (_name, spec) => {
    const shape = spec.baseFields.shape as Record<string, { description?: string }>;
    expect(shape.buildOnly?.description).toBe(
      (txModeFields.buildOnly as { description?: string }).description,
    );
  });

  it.each(specs)("%s coerces both flags from argv strings", (_name, spec) => {
    const parsed = spec.baseFields
      .pick({ permissionId: true, expiration: true })
      .parse({ permissionId: "2", expiration: "86400000" });
    expect(parsed.permissionId).toBe(2);
    expect(parsed.expiration).toBe(86_400_000);
  });
});
