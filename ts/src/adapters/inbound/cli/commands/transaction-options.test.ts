import { describe, expect, it } from "vitest";
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
