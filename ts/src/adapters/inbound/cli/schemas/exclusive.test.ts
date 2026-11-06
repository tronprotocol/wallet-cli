import { describe, it, expect } from "vitest";
import { z } from "zod";
import { exclusiveGroupsFor, exclusiveRefine } from "./exclusive.js";
import { chainInputSchema, neutralInputSchema, parseInputSchema } from "../shell/index.js";
import type { ExclusiveGroup } from "../contracts/index.js";

const fields = z.object({
  a: z.string().optional(),
  b: z.string().optional(),
  mode: z.boolean().default(false),
  other: z.boolean().default(false),
});

function issues(groups: ExclusiveGroup[], value: Record<string, unknown>) {
  const schema = fields.superRefine(exclusiveRefine(groups, fields)!);
  return schema.safeParse(value).error?.issues ?? [];
}

describe("exclusiveRefine", () => {
  const exactly: ExclusiveGroup[] = [{ label: "x", flags: ["a", "b"] }];
  const atMost: ExclusiveGroup[] = [{ label: "x", flags: ["a", "b"], select: "at-most-one" }];

  it("requires one member of an exactly-one group", () => {
    expect(issues(exactly, {})).toMatchObject([
      { path: ["a"], message: "provide exactly one of --a or --b" },
    ]);
    expect(issues(exactly, { b: "1" })).toEqual([]);
    expect(issues(exactly, { a: "1", b: "1" })).toMatchObject([
      { message: "provide exactly one of --a or --b", params: { errorCode: "invalid_option" } },
    ]);
  });

  it("allows none of an at-most-one group and names the conflicting flag", () => {
    expect(issues(atMost, {})).toEqual([]);
    expect(issues(atMost, { a: "1", b: "1" })).toMatchObject([
      { path: ["a"], message: "cannot be combined with --b" },
    ]);
  });

  it("does not count a boolean left at false", () => {
    const modes: ExclusiveGroup[] = [
      { label: "x", flags: ["mode", "other"], select: "at-most-one" },
    ];
    expect(issues(modes, { mode: true })).toEqual([]);
    expect(issues(modes, { mode: true, other: true })).toHaveLength(1);
  });

  it("drops a flag the schema does not have and skips a group left with one flag", () => {
    expect(exclusiveGroupsFor([{ label: "x", flags: ["a", "b", "c"] }], fields)).toEqual([
      { label: "x", flags: ["a", "b"] },
    ]);
    expect(exclusiveRefine([{ label: "x", flags: ["a", "c"] }], fields)).toBeUndefined();
  });

  it("keeps a stdin flag, which leaves the missing case to the run step", () => {
    const withStdin: ExclusiveGroup[] = [{ label: "x", flags: ["a", "tx-stdin"] }];
    expect(exclusiveGroupsFor(withStdin, fields)).toEqual(withStdin);
    expect(issues([{ label: "x", flags: ["a", "b", "tx-stdin"] }], {})).toEqual([]);
    expect(
      issues([{ label: "x", flags: ["a", "b", "tx-stdin"] }], { a: "1", b: "1" }),
    ).toHaveLength(1);
  });
});

describe("the shell's input schemas apply the declared groups", () => {
  const group: ExclusiveGroup[] = [{ label: "x", flags: ["a", "b"] }];

  it("on a chain command, per family", () => {
    const spec = {
      path: ["t"],
      network: "optional",
      wallet: "none",
      auth: "none",
      examples: [],
      baseFields: z.object({ a: z.string().optional() }),
      exclusive: group,
    };
    const tron = chainInputSchema(spec as never, {
      run: async () => ({}),
      fields: z.object({ b: z.string().optional() }),
    });
    expect(() => parseInputSchema(tron.input, { a: "1", b: "1" })).toThrow(
      expect.objectContaining({ code: "invalid_option" }),
    );
    // Without --b the group has one flag left and constrains nothing.
    const evm = chainInputSchema(spec as never, { run: async () => ({}) });
    expect(parseInputSchema(evm.input, {})).toEqual({});
  });

  it("on a family-neutral command", () => {
    const ab = z.object({ a: z.string().optional(), b: z.string().optional() });
    const cmd = { fields: ab, input: ab, exclusive: group };
    expect(() => parseInputSchema(neutralInputSchema(cmd as never), {})).toThrow(
      expect.objectContaining({
        code: "invalid_option",
        message: "invalid --a: provide exactly one of --a or --b",
      }),
    );
  });
});
