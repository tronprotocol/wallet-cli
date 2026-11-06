import type { RefinementCtx, ZodObject, ZodRawShape } from "zod";
import type { ExclusiveGroup } from "../contracts/index.js";
import { GLOBAL_FLAG_SPECS, globalFlagField } from "../globals/index.js";

const STDIN_FLAGS = new Set(GLOBAL_FLAG_SPECS.filter((f) => f.commandScoped).map((f) => f.name));

// Restricts each group to the flags this schema accepts: a field of another family drops out, a stdin
// flag stays. A group left with fewer than two flags constrains nothing.
export function exclusiveGroupsFor(
  groups: readonly ExclusiveGroup[] | undefined,
  fields: ZodObject<ZodRawShape>,
): ExclusiveGroup[] {
  return (groups ?? []).flatMap((group) => {
    const flags = group.flags.filter(
      (flag) => STDIN_FLAGS.has(flag) || globalFlagField(flag) in fields.shape,
    );
    return flags.length < 2 ? [] : [{ ...group, flags }];
  });
}

// Validates the groups over schema fields. A stdin flag is not in the parsed value, so a group with one
// can only reject two given fields; its run step requires one source.
export function exclusiveRefine(
  groups: readonly ExclusiveGroup[] | undefined,
  fields: ZodObject<ZodRawShape>,
): ((value: unknown, ctx: RefinementCtx) => void) | undefined {
  const effective = exclusiveGroupsFor(groups, fields);
  if (effective.length === 0) return undefined;
  return (value, ctx) => {
    const input = value as Record<string, unknown>;
    for (const group of effective) {
      const present = group.flags.filter((flag) => given(input[globalFlagField(flag)]));
      const exactlyOne = group.select !== "at-most-one";
      const missing =
        exactlyOne && present.length === 0 && !group.flags.some((flag) => STDIN_FLAGS.has(flag));
      if (present.length < 2 && !missing) continue;
      ctx.addIssue({
        code: "custom",
        path: [globalFlagField(present[0] ?? group.flags[0]!)],
        message: exactlyOne
          ? `provide exactly one of ${list(group.flags, "or")}`
          : `cannot be combined with ${list(present.slice(1), "or")}`,
        params: { errorCode: "invalid_option" },
      });
    }
  };
}

// Boolean mode flags default to false, which is not a selection.
function given(value: unknown): boolean {
  return value !== undefined && value !== false;
}

function list(flags: readonly string[], conjunction: string): string {
  const named = flags.map((flag) => `--${flag}`);
  if (named.length <= 2) return named.join(` ${conjunction} `);
  return `${named.slice(0, -1).join(", ")}, ${conjunction} ${named.at(-1)}`;
}
